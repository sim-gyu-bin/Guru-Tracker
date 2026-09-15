import "server-only";
import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { HousePtrSnapshot } from "../../../domain/house";
import { normalizeHouseDate, parseHousePtrDocument } from "./parse";
import { extractHousePtrPages } from "./pdf";
import { readZipEntry } from "./zip";

/**
 * 공식 원문 파일. PDF·ZIP은 바이너리이므로 text가 아니라 받은 그대로의 바이트로 보관한다.
 * `Uint8Array<ArrayBuffer>`로 좁혀 두는 이유: Storage 업로드의 `fetch` body(`BodyInit`)가 ArrayBuffer를
 * 가진 뷰만 받으므로, 실제로 ArrayBuffer인 원문 바이트를 그대로 넘길 수 있게 하기 위함이다.
 */
export interface HousePtrOriginal {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
}

/** 검증된 최신 PTR 한 건과 그 원문이다. 스냅샷 회전은 lease를 가진 조정자가 결정한다. */
export interface HousePtrCollection {
  snapshot: Omit<HousePtrSnapshot, "version">;
  documentHash: string;
  normalizedHash: string;
  originals: HousePtrOriginal[];
}

const ORIGIN = "https://disclosures-clerk.house.gov";
/** 연도별 전 의원 색인 크기 한도. 2026년 실측은 58KB다. */
const INDEX_LIMIT = 8_000_000;
/** 비공개 원문 버킷의 파일 한도(20MB)와 같다. PTR 스캔 PDF는 이보다 훨씬 작다. */
const PDF_LIMIT = 20_000_000;
/** 연도 판정과 미래 날짜 차단은 미국 동부 기준 날짜로만 한다. */
const easternDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const indexXml = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
});

/** 색인 XML에서 확인한 문서 식별 정보. PDF 표 밖의 값과 대조한다. */
interface PelosiFiler {
  documentId: string;
  filingDate: string;
  stateDistrict: string;
}

type FetchResult =
  | { status: "ok"; bytes: Uint8Array<ArrayBuffer> }
  | { status: "missing" };

function invalid(): never {
  throw new Error("HOUSE_VALIDATION");
}

function indexUrlOf(year: number): string {
  return `${ORIGIN}/public_disc/financial-pdfs/${year}FD.zip`;
}

function pdfUrlOf(year: number, documentId: string): string {
  return `${ORIGIN}/public_disc/ptr-pdfs/${year}/${documentId}.pdf`;
}

/**
 * 공식 호스트에서 파일 하나를 원문 바이트로 받는다.
 * 입력: 절대 URL, 전체 마감 시각, 허용 크기.
 * 출력: 받은 바이트. 공식 호스트가 404를 주면 status "missing"(그 해 색인이 아직 없거나 파일이 이동한
 *   경우이므로 수집기가 판단한다).
 * 불변 조건: https·공식 호스트만 허용하고 리다이렉트를 따르지 않으며, 선언·실제 크기 모두 한도를
 *   넘지 않아야 한다.
 * 실패 조건: 그 밖의 비정상 응답·크기 초과·빈 응답 → HOUSE_ACCESS 또는 HOUSE_VALIDATION.
 */
async function officialBytes(
  url: string,
  deadline: AbortSignal,
  limit: number,
): Promise<FetchResult> {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    target.hostname !== "disclosures-clerk.house.gov" ||
    target.username ||
    target.password ||
    target.port ||
    target.hash
  )
    invalid();
  const response = await fetch(target, {
    cache: "no-store",
    redirect: "error",
    // 기본 Node 식별자는 공식 호스트에서 거부될 수 있어 실제 앱 이름을 명시한다.
    headers: {
      "User-Agent": "GuruTracker/1.0",
      Accept: "application/pdf,application/zip;q=0.9,*/*;q=0.5",
    },
    signal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)]),
  });
  if (response.status === 404) return { status: "missing" };
  if (!response.ok || !response.body) throw new Error("HOUSE_ACCESS");
  const declaredSize = response.headers.get("content-length");
  if (declaredSize && Number(declaredSize) > limit) {
    await response.body.cancel();
    invalid();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > limit) invalid();
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof TypeError) invalid();
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (received === 0) invalid();
  // 조각을 이어 붙여 정확한 길이의 바이트를 만든다. 해시는 이 바이트로 계산한다.
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { status: "ok", bytes };
}

/**
 * 색인 XML에서 Nancy Pelosi의 PTR 중 제출일·문서번호가 가장 최신인 1건을 고른다.
 * 입력: 색인 XML 파일의 바이트, 그 색인의 연도.
 * 출력: 검증된 문서 식별 정보. 해당 연도에 Pelosi PTR이 없으면 null.
 * 불변 조건: 고른 후보의 문서번호·주/선거구·연도·제출일이 모두 검증을 통과해야 한다. 검증에 실패한
 *   후보가 있으면 조용히 건너뛰지 않고 전체를 실패시킨다(오래된 문서를 최신으로 표시하지 않기 위함).
 * 실패 조건: 인코딩·XML 구조·필드 값 검증 실패 → HOUSE_VALIDATION.
 */
function latestPelosiPtr(entry: Uint8Array, year: number): PelosiFiler | null {
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(entry);
  } catch {
    // 공식 색인 XML은 UTF-8이다. 다른 인코딩이면 서식이 바뀐 것이므로 표시하지 않는다.
    invalid();
  }
  // 외부 DTD와 사용자 정의 엔티티는 받지 않는다. 널문자 BOM을 제거한 뒤 구조를 검증한다.
  const text = raw.replace(/^\uFEFF/, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) invalid();
  if (XMLValidator.validate(text) !== true) invalid();
  const parsed = indexXml.parse(text) as Record<string, unknown> | null;
  const root = parsed?.FinancialDisclosure;
  if (typeof root !== "object" || root === null) invalid();
  const listed = (root as Record<string, unknown>).Member;
  const members = Array.isArray(listed) ? listed : listed ? [listed] : [];
  if (members.length === 0) invalid();
  let latest: PelosiFiler | null = null;
  for (const item of members) {
    if (typeof item !== "object" || item === null) invalid();
    const member = item as Record<string, unknown>;
    if (
      member.Last !== "Pelosi" ||
      member.First !== "Nancy" ||
      // FilingType "P"는 정기거래보고서(PTR)다.
      member.FilingType !== "P"
    )
      continue;
    const documentId = member.DocID;
    const stateDistrict = member.StateDst;
    const filingDate = member.FilingDate;
    if (
      typeof documentId !== "string" ||
      !/^[0-9]{8}$/.test(documentId) ||
      typeof stateDistrict !== "string" ||
      !/^[A-Z]{2}[0-9]{2}$/.test(stateDistrict) ||
      member.Year !== String(year)
    )
      invalid();
    const date = normalizeHouseDate(
      typeof filingDate === "string" ? filingDate : "",
    );
    if (date > easternDate.format(new Date())) invalid();
    // 문서번호는 8자리 연번이라 문자열 비교가 시간 순서와 같다.
    if (
      latest === null ||
      date > latest.filingDate ||
      (date === latest.filingDate && documentId > latest.documentId)
    )
      latest = { documentId, filingDate: date, stateDistrict };
  }
  return latest;
}

/**
 * 최신 Nancy Pelosi PTR 한 건과 그 원문을 수집·검증한다.
 * 입력: 전체 마감 시각(조정자가 만든 35초 deadline).
 * 출력: 스냅샷과 원문 바이트, 원문 해시·정규화 해시. Storage 저장 전까지 DB를 건드리지 않는다.
 * 불변 조건: 공식 색인에서 고른 문서번호와 PDF 안의 문서번호·제출자·주/선거구가 모두 일치해야 하며,
 *   검증을 통과하지 못하면 어떤 부분 결과도 반환하지 않는다.
 * 실패 조건: 공식 원문 접근 실패 → HOUSE_ACCESS, 서식·값 검증 실패 → HOUSE_VALIDATION.
 */
export async function collectHousePtr(
  deadline: AbortSignal,
): Promise<HousePtrCollection> {
  const today = easternDate.format(new Date());
  const currentYear = Number(today.slice(0, 4));
  // 올해 색인에 Pelosi PTR이 아직 없을 수 있으므로 전년도까지 확인한다. 두 해를 넘어가는 문서는 없다.
  let seenIndex = false;
  let found: {
    year: number;
    indexUrl: string;
    filer: PelosiFiler;
    entry: Uint8Array<ArrayBuffer>;
  } | null = null;
  for (const year of [currentYear, currentYear - 1]) {
    const indexUrl = indexUrlOf(year);
    const archive = await officialBytes(indexUrl, deadline, INDEX_LIMIT);
    if (archive.status === "missing") continue;
    seenIndex = true;
    const entry = readZipEntry(archive.bytes, `${year}FD.xml`, INDEX_LIMIT);
    if (!entry) invalid();
    const filer = latestPelosiPtr(entry, year);
    if (!filer) continue;
    found = { year, indexUrl, filer, entry };
    break;
  }
  if (!found) throw new Error(seenIndex ? "HOUSE_VALIDATION" : "HOUSE_ACCESS");
  const sourceUrl = pdfUrlOf(found.year, found.filer.documentId);
  const pdf = await officialBytes(sourceUrl, deadline, PDF_LIMIT);
  if (pdf.status === "missing") invalid();
  const pages = await extractHousePtrPages(pdf.bytes);
  const document = parseHousePtrDocument({
    pages,
    documentId: found.filer.documentId,
    stateDistrict: found.filer.stateDistrict,
    filingDate: found.filer.filingDate,
  });
  return {
    snapshot: {
      ...document,
      sourceUrl,
      indexUrl: found.indexUrl,
    },
    documentHash: createHash("sha256").update(pdf.bytes).digest("hex"),
    // 게시 시각이나 색인 부가 정보만 바뀌면 실제 거래 변경 이벤트를 만들지 않도록 내용만 해시한다.
    normalizedHash: createHash("sha256")
      .update(JSON.stringify(document))
      .digest("hex"),
    originals: [
      {
        name: "filings.xml",
        bytes: found.entry,
        contentType: "application/xml",
      },
      { name: "ptr.pdf", bytes: pdf.bytes, contentType: "application/pdf" },
    ],
  };
}
