import "server-only";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { SecHolding, SecManager, SecSnapshot } from "../domain/sec";

/**
 * SEC 13F 수집 대상 설정이다. cik는 submissions 경로·제출자 자격에서 쓰는 10자리 0 패딩 형식이고,
 * archiveCik은 EDGAR Archive 경로(/Archives/edgar/data/<archiveCik>/)에 쓰는 0 없는 숫자 형식이다.
 * managerName은 submissions.name과 표지 filingManager.name에서 대소문자만 무시해 일치해야 하며,
 * 다른 관리자(예: 같은 서류를 함께 제출한 다른 Scion 법인)의 이름으로는 통과하지 않는다.
 */
const MANAGERS: Record<
  SecManager,
  { cik: string; archiveCik: string; managerName: string }
> = {
  // Stanley Druckenmiller가 제출한 13F다. 개인 계좌의 전 보유를 뜻하지 않는다.
  stanley: {
    cik: "0001536411",
    archiveCik: "1536411",
    managerName: "Duquesne Family Office LLC",
  },
  // Michael Burry가 제출한 13F다. 옵션 행은 기초자산 기준 수량·평가금액만 기록하며 손익을 추정하지 않는다.
  burry: {
    cik: "0001649339",
    archiveCik: "1649339",
    managerName: "Scion Asset Management, LLC",
  },
  // 아래 세 대상도 개인 계좌가 아닌 해당 기관의 공식 13F만 수집한다.
  laffont: {
    cik: "0001135730",
    archiveCik: "1135730",
    managerName: "COATUE MANAGEMENT LLC",
  },
  gerstner: {
    cik: "0001541617",
    archiveCik: "1541617",
    managerName: "Altimeter Capital Management, LP",
  },
  tepper: {
    cik: "0001656456",
    archiveCik: "1656456",
    managerName: "Appaloosa LP",
  },
};
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
});
type RecordValue = Record<string, unknown>;
type Filing = {
  accession: string;
  filingDate: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
};
/** 검증된 원문과 스냅샷을 함께 넘겨 Storage 저장 전에 DB가 변경되지 않게 한다. */
export type VerifiedSec = {
  snapshot: Omit<SecSnapshot, "version">;
  documentHash: string;
  normalizedHash: string;
  originals: { name: string; text: string; contentType: string }[];
};
function fail(): never {
  throw new Error("SEC_VALIDATION");
}
function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  return value as RecordValue;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return fail();
  return value.trim();
}
function integer(value: unknown): bigint {
  const raw = text(value);
  if (!/^\d+$/.test(raw)) return fail();
  return BigInt(raw);
}
function list(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
function date(value: unknown): string {
  const raw = text(value);
  const converted = /^\d{2}-\d{2}-\d{4}$/.test(raw)
    ? `${raw.slice(6)}-${raw.slice(0, 2)}-${raw.slice(3, 5)}`
    : raw;
  const parsed = new Date(converted);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(converted) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== converted
  )
    return fail();
  return converted;
}
function xml(raw: string): RecordValue {
  // 외부 DTD와 사용자 정의 엔티티를 허용하지 않는다. 기본 XML 엔티티만 파서가 해석한다.
  if (/<!DOCTYPE|<!ENTITY/i.test(raw) || XMLValidator.validate(raw) !== true)
    return fail();
  try {
    const parsed = record(parser.parse(raw));
    if (Object.keys(parsed).filter((key) => !key.startsWith("?")).length !== 1)
      return fail();
    return parsed;
  } catch {
    return fail();
  }
}
function json(raw: string): RecordValue {
  try {
    return record(JSON.parse(raw));
  } catch {
    return fail();
  }
}
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function safeName(value: unknown): string {
  const name = text(value);
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return fail();
  return name;
}

/** SEC에만 요청하고 리다이렉트·과대 응답·오류 문서를 거부한다. 초당 10회보다 낮게 순차 요청한다. */
async function fetchSec(
  url: string,
  userAgent: string,
  signal: AbortSignal,
): Promise<string> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !["www.sec.gov", "data.sec.gov"].includes(parsed.hostname)
  )
    return fail();
  await delay(150, undefined, { signal });
  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json, application/xml, text/xml",
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length") ?? 0) > 20_000_000
  )
    throw new Error("SEC_ACCESS");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("SEC_ACCESS");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 20_000_000) {
      await reader.cancel();
      throw new Error("SEC_ACCESS");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** 정보표 행 수·합계·단위·수량을 표지와 대조한다. 잘린 표, 비공개 누락, 불명확한 값은 반영하지 않는다. */
function parseTable(
  raw: string,
  cover: RecordValue,
  filing: Filing,
): SecHolding[] {
  const root = record(xml(raw).informationTable);
  const entries = list(root.infoTable);
  const summary = record(cover.summaryPage);
  // SEC 공개 데이터 정의에서 이 표시는 nullable이다. 미표시는 허용하되 명시된 비공개 누락·알 수 없는 값은 거부한다.
  // https://www.sec.gov/files/form_13f_readme.pdf
  if (
    summary.isConfidentialOmitted !== undefined &&
    !["false", "0"].includes(text(summary.isConfidentialOmitted))
  )
    return fail();
  if (
    BigInt(entries.length) !== integer(summary.tableEntryTotal) ||
    entries.length === 0
  )
    return fail();
  let total = BigInt(0);
  // SEC 2023-01-03 이후 제출은 달러 단위, 이전 제출은 천 달러 단위다. 보고분기가 아닌 제출일 기준이다.
  const multiplier = BigInt(filing.filingDate >= "2023-01-03" ? 1 : 1000);
  const holdings = entries.map((entry): SecHolding => {
    const row = record(entry);
    const quantity = record(row.shrsOrPrnAmt);
    const value = integer(row.value);
    total += value;
    const shareType = text(quantity.sshPrnamtType);
    const putCall =
      row.putCall === undefined || row.putCall === ""
        ? null
        : text(row.putCall).toUpperCase();
    if (shareType !== "SH" && shareType !== "PRN") return fail();
    if (putCall !== null && putCall !== "PUT" && putCall !== "CALL")
      return fail();
    const cusip = text(row.cusip);
    if (!/^[A-Za-z0-9*@#]{9}$/.test(cusip)) return fail();
    return {
      issuer: text(row.nameOfIssuer),
      titleOfClass: text(row.titleOfClass),
      cusip,
      valueUsd: (value * multiplier).toString(),
      shares: integer(quantity.sshPrnamt).toString(),
      shareType,
      putCall,
    };
  });
  // Form 13F 특별지침 7.c·8은 총액과 각 행을 가장 가까운 단위로 반올림한다.
  // 각각 반올림한 행 합계와 원금액 총합의 반올림 차이는 최대 floor(행 수 / 2) 단위다.
  // 임의 비율 오차를 허용하지 않으며 원문 값은 보정하지 않는다. https://www.sec.gov/files/form13f.pdf
  const difference = total - integer(summary.tableValueTotal);
  const roundingBound = BigInt(Math.floor(entries.length / 2));
  if (difference < -roundingBound || difference > roundingBound) return fail();
  return holdings;
}

/**
 * 대상 하나의 최신 보고분기를 우선하고 그 분기의 원본→정정 순서로 해석한다. 과거분기 정정은 현재를 되돌리지 않는다.
 * manager로만 제출자 설정을 고르며 화면·요청에서 CIK나 제출자 이름을 받지 않는다. 검증 실패 시 스냅샷을 만들지 않는다.
 */
export async function collectSec(
  manager: SecManager,
  userAgent: string,
  signal: AbortSignal,
): Promise<VerifiedSec> {
  const target = MANAGERS[manager];
  const submissions = await fetchSec(
    `https://data.sec.gov/submissions/CIK${target.cik}.json`,
    userAgent,
    signal,
  );
  const source = json(submissions);
  if (
    String(source.cik).padStart(10, "0") !== target.cik ||
    text(source.name).toLowerCase() !== target.managerName.toLowerCase()
  )
    return fail();
  const recent = record(record(source.filings).recent);
  const forms = list(recent.form);
  for (const key of [
    "accessionNumber",
    "filingDate",
    "reportDate",
    "primaryDocument",
  ])
    if (list(recent[key]).length !== forms.length) return fail();
  // recent에는 XML 의무화 이전의 TXT 공시도 포함된다. 이번 조회 대상 분기를 먼저 정한 뒤 그 분기의 문서 형식만 검증한다.
  const candidates = forms.flatMap((form, index) =>
    form === "13F-HR" || form === "13F-HR/A"
      ? [{ form, index, reportDate: date(list(recent.reportDate)[index]) }]
      : [],
  );
  if (!candidates.length) return fail();
  const latestPeriod = candidates
    .map((filing) => filing.reportDate)
    .sort()
    .at(-1);
  const chain: Filing[] = candidates
    .filter((filing) => filing.reportDate === latestPeriod)
    .map(({ form, index, reportDate }) => {
      const accession = text(list(recent.accessionNumber)[index]);
      if (!/^\d{10}-\d{2}-\d{6}$/.test(accession)) return fail();
      // submissions의 XSL 표시 경로 대신 동일 accession 디렉터리의 실제 XML을 읽는다.
      const primaryPath = text(list(recent.primaryDocument)[index]);
      if (
        !/^(?:xslForm13F_[A-Za-z0-9]+\/)?[A-Za-z0-9_.-]+\.xml$/.test(
          primaryPath,
        )
      )
        return fail();
      return {
        accession,
        form,
        reportDate,
        filingDate: date(list(recent.filingDate)[index]),
        primaryDocument: safeName(primaryPath.split("/").at(-1)),
      };
    })
    .sort(
      (a, b) =>
        a.filingDate.localeCompare(b.filingDate) ||
        a.accession.localeCompare(b.accession),
    );
  if (chain.length > 20) return fail();
  const originals: VerifiedSec["originals"] = [
    {
      name: "submissions.json",
      text: submissions,
      contentType: "application/json",
    },
  ];
  let holdings: SecHolding[] | null = null;
  let snapshot: Omit<SecSnapshot, "version"> | null = null;
  let amendmentNumber = BigInt(0);
  const documentParts: string[] = [];
  for (const filing of chain) {
    const base = `https://www.sec.gov/Archives/edgar/data/${target.archiveCik}/${filing.accession.replaceAll("-", "")}`;
    const primary = await fetchSec(
      `${base}/${filing.primaryDocument}`,
      userAgent,
      signal,
    );
    const document = record(xml(primary).edgarSubmission);
    const header = record(document.headerData);
    const form = record(document.formData);
    const cover = record(form.coverPage);
    if (
      text(header.submissionType) !== filing.form ||
      date(cover.reportCalendarOrQuarter) !== filing.reportDate ||
      text(record(cover.filingManager).name).toLowerCase() !==
        target.managerName.toLowerCase()
    )
      return fail();
    const filer = record(record(header.filerInfo).filer);
    if (text(record(filer.credentials).cik).padStart(10, "0") !== target.cik)
      return fail();
    if (text(cover.reportType) !== "13F HOLDINGS REPORT") return fail();
    // SEC ISAMENDMENT는 nullable이며 원본 13F-HR 표지에서 생략될 수 있다.
    // https://www.sec.gov/files/form_13f.pdf (Form 13F Data Sets Contents)
    // 미표시를 정정의 false로 일괄 변환하지 않는다. 제출 유형과 정정 메타데이터를 함께 검증한다.
    const isAmendment =
      cover.isAmendment === undefined ? null : text(cover.isAmendment);
    let mode = "RESTATEMENT";
    if (filing.form === "13F-HR/A") {
      if (isAmendment === null || !["true", "1"].includes(isAmendment))
        return fail();
      const nextNumber = integer(cover.amendmentNo);
      mode = text(record(cover.amendmentInfo).amendmentType);
      if (mode !== "RESTATEMENT" && mode !== "NEW HOLDINGS") return fail();
      if (
        nextNumber <= amendmentNumber ||
        (mode === "NEW HOLDINGS" && nextNumber !== amendmentNumber + BigInt(1))
      )
        return fail();
      amendmentNumber = nextNumber;
    } else if (
      (isAmendment !== null && !["false", "0"].includes(isAmendment)) ||
      (isAmendment === null &&
        (cover.amendmentNo !== undefined ||
          cover.amendmentInfo !== undefined)) ||
      holdings !== null
    )
      return fail();
    const indexRaw = await fetchSec(`${base}/index.json`, userAgent, signal);
    const items = list(record(json(indexRaw).directory).item);
    const names = items
      .map((item) => safeName(record(item).name))
      .filter(
        (name) =>
          name.toLowerCase().endsWith(".xml") &&
          name !== filing.primaryDocument,
      );
    if (names.length === 0 || names.length > 10) return fail();
    let table: { name: string; raw: string } | null = null;
    for (const name of names) {
      const raw = await fetchSec(`${base}/${name}`, userAgent, signal);
      const parsed = xml(raw);
      if (parsed.informationTable !== undefined) {
        if (table) return fail();
        table = { name, raw };
      }
    }
    if (!table) return fail();
    const parsedHoldings = parseTable(table.raw, form, filing);
    // NEW HOLDINGS는 추가분만 포함한다. 원본 표 없이는 불완전한 합성을 거부한다.
    if (mode === "NEW HOLDINGS") {
      if (holdings === null) return fail();
      holdings = holdings.concat(parsedHoldings);
    } else holdings = parsedHoldings;
    originals.push(
      {
        name: `${filing.accession}/primary.xml`,
        text: primary,
        contentType: "application/xml",
      },
      {
        name: `${filing.accession}/index.json`,
        text: indexRaw,
        contentType: "application/json",
      },
      {
        name: `${filing.accession}/information.xml`,
        text: table.raw,
        contentType: "application/xml",
      },
    );
    documentParts.push(filing.accession, hash(primary), hash(table.raw));
    snapshot = {
      accession: filing.accession,
      cik: target.cik,
      managerName: target.managerName,
      reportDate: filing.reportDate,
      filingDate: filing.filingDate,
      form: filing.form,
      sourceUrl: `${base}/${filing.primaryDocument}`,
      informationTableUrl: `${base}/${table.name}`,
      holdings,
    };
  }
  if (!snapshot || !holdings) return fail();
  holdings.sort((a, b) => {
    const x = JSON.stringify(a);
    const y = JSON.stringify(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  snapshot.holdings = holdings;
  return {
    snapshot,
    documentHash: hash(JSON.stringify(documentParts)),
    normalizedHash: hash(
      JSON.stringify({ reportDate: snapshot.reportDate, holdings }),
    ),
    originals,
  };
}
