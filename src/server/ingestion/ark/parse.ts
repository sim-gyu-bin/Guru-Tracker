import type { ArkFund, ArkHolding } from "../../../domain/ark";

const HEADERS = [
  "date",
  "fund",
  "company",
  "ticker",
  "cusip",
  "shares",
  "market value ($)",
  "weight (%)",
];

function invalid(): never {
  throw new Error("ARK_VALIDATION");
}

/** 쉼표가 들어간 금액·따옴표 이스케이프·줄바꿈을 RFC 4180 방식으로 읽고 잘린 인용 필드를 거부한다. */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  for (
    let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    index < text.length;
    index += 1
  ) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += character;
      continue;
    }
    if (character === "," || character === "\r" || character === "\n") {
      row.push(field);
      field = "";
      closed = false;
      if (character !== ",") {
        rows.push(row);
        row = [];
        if (character === "\r" && text[index + 1] === "\n") index += 1;
      }
    } else if (character === '"' && field === "" && !closed) {
      quoted = true;
    } else {
      if (closed || character === '"') invalid();
      field += character;
    }
  }
  if (quoted) invalid();
  if (field !== "" || row.length > 0 || closed) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function dateValue(raw: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (!match) invalid();
  const value = `${match[3]}-${match[1]}-${match[2]}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    invalid();
  return value;
}

/** 통화·퍼센트 장식을 제거하되 부호와 십진 정밀도를 유지한다. 쉼표는 정상 천 단위 구분만 허용한다. */
function decimal(raw: string, kind: "money" | "shares" | "weight"): string {
  let value = raw.trim();
  if (kind === "money") {
    if (value.startsWith("-$")) value = `-${value.slice(2)}`;
    else if (value.startsWith("$")) value = value.slice(1);
  }
  if (kind === "weight" && value.endsWith("%")) value = value.slice(0, -1);
  if (
    value.length > 80 ||
    !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)
  )
    invalid();
  value = value.replaceAll(",", "");
  const negative = value.startsWith("-");
  const [integer, fraction = ""] = (negative ? value.slice(1) : value).split(
    ".",
  );
  if (kind !== "shares" && fraction.length > 2) invalid();
  const whole = BigInt(integer).toString();
  const digits =
    kind === "money" ? fraction.padEnd(2, "0") : fraction.replace(/0+$/, "");
  const sign = negative && (whole !== "0" || /[1-9]/.test(digits)) ? "-" : "";
  return `${sign}${whole}${digits ? `.${digits}` : ""}`;
}

function hundredths(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const result = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return negative ? -result : result;
}

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value;
}

/**
 * 공식 ARK CSV의 한 펀드·한 기준일 전체 보유 자료를 검증한다. SEC의 SH/PRN·CUSIP 체크섬을 강요하지 않는다.
 * 소수 금액·빈 티커·사설 식별자는 보존한다. 잘린 파일, 다른 펀드/날짜 혼합, 중복 자산과 모순된 비중은 실패한다.
 * 말미의 공식 고지까지 확인하므로 행 경계에서 잘린 파일을 정상 전체 보유 자료로 받아들이지 않는다.
 */
export function parseArkHoldingsCsv(
  text: string,
  fund: ArkFund,
): { reportDate: string; holdings: ArkHolding[] } {
  const rows = csvRows(text);
  const header = rows.shift()?.map((value) => value.trim().toLowerCase());
  if (
    !header ||
    header.length !== HEADERS.length ||
    new Set(header).size !== HEADERS.length ||
    HEADERS.some((name) => !header.includes(name))
  )
    invalid();
  const column = (name: string) => header.indexOf(name);
  const holdings: ArkHolding[] = [];
  const identities = new Set<string>();
  let reportDate: string | null = null;
  let footer = false;
  for (const row of rows) {
    if (row.every((value) => value.trim() === "")) continue;
    if (
      row.length === 1 &&
      row[0].startsWith("Investors should carefully consider") &&
      row[0].includes("Holdings are subject to change")
    ) {
      if (footer || holdings.length === 0) invalid();
      footer = true;
      continue;
    }
    if (
      footer ||
      row.length !== header.length ||
      row[column("fund")].trim() !== fund
    )
      invalid();
    const currentDate = dateValue(row[column("date")].trim());
    if (reportDate !== null && reportDate !== currentDate) invalid();
    reportDate = currentDate;
    const company = row[column("company")].trim();
    const ticker = row[column("ticker")].trim() || null;
    const identifier = row[column("cusip")].trim();
    if (
      !company ||
      !identifier ||
      company.length > 256 ||
      identifier.length > 128 ||
      (ticker?.length ?? 0) > 64 ||
      [company, ticker ?? "", identifier].some((value) =>
        /[\u0000-\u001f\u007f]/.test(value),
      )
    )
      invalid();
    const id = JSON.stringify([identifier, company, ticker]);
    if (identities.has(id)) invalid();
    identities.add(id);
    holdings.push({
      id,
      company,
      ticker,
      identifier,
      shares: decimal(row[column("shares")], "shares"),
      valueUsd: decimal(row[column("market value ($)")], "money"),
      weightPercent: decimal(row[column("weight (%)")], "weight"),
    });
  }
  if (
    !footer ||
    !reportDate ||
    holdings.length === 0 ||
    holdings.length > 2_000
  )
    invalid();
  const total = holdings.reduce(
    (sum, holding) => sum + hundredths(holding.valueUsd),
    BigInt(0),
  );
  const weightTotal = holdings.reduce(
    (sum, holding) => sum + hundredths(holding.weightPercent),
    BigInt(0),
  );
  if (total <= BigInt(0)) invalid();
  // 0.01% 단위로 반올림한 비중 합계는 100%에서 행 수 × 0.005%까지 어긋날 수 있다.
  if (
    abs(weightTotal - BigInt(10_000)) * BigInt(2) >
    BigInt(holdings.length + 2)
  )
    invalid();
  for (const holding of holdings) {
    // 실제 공식 파일의 반올림·분모 차이를 고려해 행별 0.01%p까지 허용한다. 명백한 열 밀림·금액 누락은 거부한다.
    if (
      abs(
        hundredths(holding.weightPercent) * total -
          hundredths(holding.valueUsd) * BigInt(10_000),
      ) > total
    )
      invalid();
  }
  return { reportDate, holdings };
}
