import {
  HOUSE_PTR_ASSET_TYPE_LABELS,
  HOUSE_PTR_FILER_NAME,
  HOUSE_PTR_FILER_STATUS,
  HOUSE_PTR_OWNER_CODES,
  HOUSE_PTR_TRANSACTION_TYPES,
  type HousePtrTransaction,
} from "../../../domain/house";

/**
 * 하우스 PTR PDF의 좌표 기반 파서.
 *
 * 입력: pdfjs가 페이지별로 돌려준 텍스트 조각(문자열 + PDF 사용자 공간 좌표)과, 색인 XML에서
 *       확인한 문서번호·주/선거구·제출일.
 * 출력: 최신 PTR 문서 1건의 거래 행과, 표 밖에서 대조한 제출자 정보(version은 DB가 붙인다).
 * 불변 조건:
 * - 표 밖 값(Filing ID·P T R·Name·Status·State/District·서명)이 기대값과 다르면 다른 문서이므로 실패한다.
 * - 거래유형·소유자·자산유형 코드는 공식 정의 집합에 있는 값만 받는다. 모르는 코드는 표시하지 않고 실패한다.
 * - 금액은 원문 거래금액 범위 문자열 그대로다. 숫자로 환산하거나 합계·비중을 만들지 않는다.
 * 실패 조건: 페이지마다 반복되는 표 헤더를 찾지 못하거나, 표 종료 각주를 만나지 못하거나, 열을
 *           확정할 수 없는 조각이 있으면 `HOUSE_VALIDATION`으로 전체를 실패시킨다(부분 수용 금지).
 */

/** pdfjs 텍스트 조각 중 이 파서가 쓰는 좌표만 남긴 형태. y는 위쪽이 큰 PDF 좌표계다. */
export type HousePtrTextItem = {
  readonly text: string;
  readonly x: number;
  readonly y: number;
};

/** 색인 XML에서 확인한 문서 식별 정보. PDF 표 밖의 값과 대조한다. */
export type HousePtrDocumentInput = {
  readonly pages: readonly (readonly HousePtrTextItem[])[];
  readonly documentId: string;
  readonly stateDistrict: string;
  readonly filingDate: string;
};

/** 파서가 확정한 문서 내용. 출처 주소는 수집기가 붙인다. */
export type HousePtrDocument = {
  readonly documentId: string;
  readonly filerName: string;
  readonly filerStatus: string;
  readonly stateDistrict: string;
  readonly filingDate: string;
  readonly signedAt: string | null;
  readonly transactions: readonly HousePtrTransaction[];
};

type Column =
  | "owner"
  | "asset"
  | "transaction"
  | "date"
  | "notification"
  | "amount";

type Item = { text: string; x: number; y: number };
type Row = {
  text: string;
  items: Item[];
  cells: Record<Column, string>;
  inTable: boolean;
};
type Columns = Record<Column, number> & { boundary: number };

const COLUMN_ORDER = [
  "owner",
  "asset",
  "transaction",
  "date",
  "notification",
  "amount",
] as const;

/** 같은 줄로 묶는 y 허용 오차. 실제 줄 간격은 10px 이상이라 이 값으로는 줄이 합쳐지지 않는다. */
const LINE_TOLERANCE = 3;
/** 페이지마다 반복되는 표 헤더의 열 라벨. 이 라벨이 있는 줄은 거래 행이 아니다. */
const HEADER_LABELS: Readonly<Record<string, true>> = {
  ID: true,
  Owner: true,
  Asset: true,
  Transaction: true,
  Type: true,
  Date: true,
  Notification: true,
  Amount: true,
  "Cap.": true,
  "Gains >": true,
  "$200?": true,
};
/** 표가 끝나는 공식 각주 문구. 표 종료를 이 문구로만 판정한다. */
const TABLE_END = "* For the complete list";
const FILING_ID = /^Filing ID #([0-9]{8})$/;
const REPORT_TYPE = /^P\s*T\s*R$/;
const REPORT_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const ASSET_CODE = /^(.*?)\s*\[([A-Z0-9]{2})\]$/;
/** 자산 열에 내려오는 하위 줄 접두. "F S :"는 별도 값이고 D·L·C 등은 설명 줄이다. */
const ITEM_PREFIX = /^((?:[A-Z] )?[A-Z])\s*:\s*(.*)$/;
/** 공식 PTR이 쓰는 거래금액 범위 표기. "$N", "Over $N", "$N - $M"만 받는다. */
const AMOUNT =
  /^(?:Over )?\$[0-9][0-9,]*(?:\.[0-9]{2})?(?: - (?:Over )?\$[0-9][0-9,]*(?:\.[0-9]{2})?)?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function invalid(): never {
  throw new Error("HOUSE_VALIDATION");
}

/** 장식 문자는 널문자 패딩으로 채워져 있다. 널을 공백으로 바꾸지 않으면 열 라벨 비교가 어긋난다. */
function normalize(raw: string): string {
  return raw
    .replace(/\u0000+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 원문 M/D/YYYY를 YYYY-MM-DD로만 바꾼다. 존재하지 않는 날짜는 표시하지 않고 실패시킨다.
 * 색인 XML의 제출일과 PDF의 거래·서명 날짜에 같은 규칙을 쓰기 위해 밖으로 노출한다.
 */
export function normalizeHouseDate(raw: string): string {
  const matched = REPORT_DATE.exec(raw);
  if (!matched) invalid();
  const month = matched[1].padStart(2, "0");
  const day = matched[2].padStart(2, "0");
  const value = `${matched[3]}-${month}-${day}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    invalid();
  return value;
}

function emptyCells(): Record<Column, string> {
  return {
    owner: "",
    asset: "",
    transaction: "",
    date: "",
    notification: "",
    amount: "",
  };
}

/** 페이지의 조각을 y 허용 오차로 줄로 묶고 위에서 아래, 왼쪽에서 오른쪽 순서로 돌려준다. */
function pageRows(items: readonly HousePtrTextItem[]): Row[] {
  const flat: Item[] = [];
  for (const item of items) {
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) invalid();
    const text = normalize(item.text);
    if (text === "") continue;
    if (text.length > 1_000) invalid();
    flat.push({ text, x: item.x, y: item.y });
  }
  flat.sort((left, right) => right.y - left.y || left.x - right.x);
  const rows: Row[] = [];
  for (const item of flat) {
    const current = rows.at(-1);
    if (current && Math.abs(current.items[0].y - item.y) <= LINE_TOLERANCE)
      current.items.push(item);
    else
      rows.push({
        text: "",
        items: [item],
        cells: emptyCells(),
        inTable: false,
      });
  }
  return rows;
}

/** 표 헤더 줄에서 열 기준 x를 읽는다. 열 순서가 뒤바뀌면 배정을 확정할 수 없으므로 실패한다. */
function headerColumns(row: Row): Columns {
  const at = (label: string) => {
    const item = row.items.find((candidate) => candidate.text === label);
    if (!item) invalid();
    return item.x;
  };
  const id = at("ID");
  const owner = at("Owner");
  const asset = at("Asset");
  const transaction = at("Transaction");
  const date = at("Date");
  const notification = at("Notification");
  const amount = at("Amount");
  if (
    !(
      id < owner &&
      owner < asset &&
      asset < transaction &&
      transaction < date &&
      date < notification &&
      notification < amount
    )
  )
    invalid();
  return {
    owner,
    asset,
    transaction,
    date,
    notification,
    amount,
    boundary: (id + owner) / 2,
  };
}

/** 조각을 가장 가까운 열에 배정한다. 문서마다 몇 px씩 다른 열 x를 페이지 헤더에서 다시 읽어 흡수한다. */
function fillCells(row: Row, columns: Columns): void {
  for (const item of row.items) {
    // ID 열(x가 owner 앞) 조각은 표 밖 값이므로 버린다.
    if (item.x < columns.boundary) continue;
    row.inTable = true;
    let best: Column = COLUMN_ORDER[0];
    let distance = Math.abs(item.x - columns[best]);
    for (const column of COLUMN_ORDER) {
      const current = Math.abs(item.x - columns[column]);
      if (current < distance) {
        distance = current;
        best = column;
      }
    }
    const previous = row.cells[best];
    row.cells[best] = previous === "" ? item.text : `${previous} ${item.text}`;
  }
}

/**
 * 표 밖 라벨에 붙은 값을 읽는다. 이 서식은 라벨이 줄 왼쪽(x=22), 값이 라벨 오른쪽(x=99 안팎)에
 * 오고 그 줄에는 두 조각만 있다. 라벨이나 값이 정확히 하나가 아니면 구조가 바뀐 것이므로
 * 실패시킨다.
 */
function labelValue(rows: readonly Row[], label: string): string {
  const found = rows.filter((row) =>
    row.items.some((item) => item.text === label),
  );
  if (found.length !== 1) invalid();
  const row = found[0];
  const labels = row.items.filter((item) => item.text === label);
  if (labels.length !== 1) invalid();
  const values = row.items.filter((item) => item.x > labels[0].x);
  if (values.length !== 1) invalid();
  return values[0].text;
}

/** 수집 중인 한 거래 행. 원문 순서를 유지한 조각 목록이며 마지막에 검증하고 확정한다. */
type Draft = {
  owner: string[];
  asset: string[];
  transaction: string[];
  date: string[];
  notification: string[];
  amount: string[];
  filingStatus: string | null;
  details: string[];
};

function openDraft(cells: Record<Column, string>): Draft {
  return {
    owner: cells.owner === "" ? [] : [cells.owner],
    asset: cells.asset === "" ? [] : [cells.asset],
    transaction: [cells.transaction],
    date: [cells.date],
    notification: cells.notification === "" ? [] : [cells.notification],
    amount: cells.amount === "" ? [] : [cells.amount],
    filingStatus: null,
    details: [],
  };
}

/** 모은 조각을 공식 코드 집합과 원문 표기 규칙으로 검증하고 거래 행 하나로 확정한다. */
function finalize(draft: Draft): HousePtrTransaction {
  const assetText = draft.asset.join(" ").trim();
  const matchedAsset = ASSET_CODE.exec(assetText);
  if (!matchedAsset) invalid();
  const asset = matchedAsset[1].trim();
  const assetTypeCode = matchedAsset[2];
  if (
    asset === "" ||
    asset.length > 300 ||
    CONTROL.test(asset) ||
    !Object.hasOwn(HOUSE_PTR_ASSET_TYPE_LABELS, assetTypeCode)
  )
    invalid();
  const transactionType = draft.transaction.join(" ").trim();
  if (!Object.hasOwn(HOUSE_PTR_TRANSACTION_TYPES, transactionType)) invalid();
  const transactionDate = normalizeHouseDate(draft.date.join(" ").trim());
  const notified = draft.notification.join(" ").trim();
  const amountRange = draft.amount.join(" ").trim();
  if (!AMOUNT.test(amountRange)) invalid();
  const ownerCode = draft.owner.join(" ").trim();
  if (!Object.hasOwn(HOUSE_PTR_OWNER_CODES, ownerCode)) invalid();
  const filingStatus = draft.filingStatus;
  if (
    filingStatus !== null &&
    (CONTROL.test(filingStatus) || filingStatus.length > 100)
  )
    invalid();
  for (const detail of draft.details) {
    if (detail === "" || detail.length > 500 || CONTROL.test(detail)) invalid();
  }
  return {
    asset,
    assetTypeCode,
    transactionType,
    transactionDate,
    notificationDate: notified === "" ? null : normalizeHouseDate(notified),
    amountRange,
    ownerCode,
    filingStatus,
    details: [...draft.details],
  };
}

/**
 * 하원 PTR PDF 한 건을 검증해 거래 행을 확정한다. 거래 행은 페이지 경계를 넘을 수 있으므로
 * 페이지마다 열 기준만 다시 읽고, 줄은 문서 순서대로 이어서 처리한다.
 */
export function parseHousePtrDocument(
  input: HousePtrDocumentInput,
): HousePtrDocument {
  if (
    !/^[0-9]{8}$/.test(input.documentId) ||
    !/^[A-Z]{2}[0-9]{2}$/.test(input.stateDistrict) ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.filingDate) ||
    input.pages.length === 0 ||
    input.pages.length > 30
  )
    invalid();

  const pages = input.pages.map((page) => pageRows(page));
  const rows = pages.flat();
  if (rows.length > 20_000) invalid();

  // 표 밖 문서 식별: 다른 문서·다른 제출자를 표시하지 않도록 전부 대조한다.
  let filingId: string | null = null;
  let reportTypes = 0;
  for (const row of rows) {
    for (const item of row.items) {
      const matchedId = FILING_ID.exec(item.text);
      if (matchedId) {
        if (filingId !== null) invalid();
        filingId = matchedId[1];
      }
      if (REPORT_TYPE.test(item.text)) reportTypes += 1;
    }
  }
  if (filingId !== input.documentId || reportTypes !== 1) invalid();
  if (
    labelValue(rows, "Name:") !== HOUSE_PTR_FILER_NAME ||
    labelValue(rows, "Status:") !== HOUSE_PTR_FILER_STATUS ||
    labelValue(rows, "State/District:") !== input.stateDistrict
  )
    invalid();
  const signature = labelValue(rows, "Digitally Signed:");
  const signatureDate = signature.replace(/^.*,\s*/, "");
  const signatureName = normalize(
    signature.replace(/,\s*\d{1,2}\/\d{1,2}\/\d{4}$/, ""),
  );
  if (
    !REPORT_DATE.test(signatureDate) ||
    signatureName !== HOUSE_PTR_FILER_NAME
  )
    invalid();

  // 열 기준은 페이지마다 반복되는 표 헤더에서 읽는다. 헤더가 없는 페이지는 배정을 확정할 수 없으므로
  // (서식이 바뀐 것이므로) 실패시킨다.
  const columns = pages.map((page) => {
    const header = page.find((row) =>
      row.items.some((item) => item.text === "Owner"),
    );
    if (!header || !header.items.some((item) => item.text === "Asset"))
      invalid();
    return headerColumns(header);
  });
  pages.forEach((page, index) => {
    for (const row of page) {
      fillCells(row, columns[index]);
      row.text = row.items.map((item) => item.text).join(" ");
    }
  });

  const isHeader = (row: Row) =>
    row.items.some((item) => Object.hasOwn(HEADER_LABELS, item.text));
  // 표 헤더 다음 줄부터 거래 행이 시작한다. 헤더 앞 줄은 문서 식별 정보와 인증 문구다.
  let start = -1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (
      row.items.some((item) => item.text === "Owner") &&
      row.items.some((item) => item.text === "Asset")
    ) {
      start = index + 1;
      break;
    }
  }
  if (start < 0) invalid();

  const transactions: HousePtrTransaction[] = [];
  let draft: Draft | null = null;
  let ended = false;
  for (let index = start; index < rows.length; index += 1) {
    const row = rows[index];
    // 표 종료 각주 아래의 인증 문구·부가 섹션은 거래 행이 아니다.
    if (row.text.startsWith(TABLE_END)) {
      ended = true;
      break;
    }
    if (isHeader(row)) continue;
    if (!row.inTable) break;
    const cells = row.cells;
    if (cells.transaction !== "" && cells.date !== "") {
      if (draft) transactions.push(finalize(draft));
      draft = openDraft(cells);
      continue;
    }
    if (!draft) invalid();
    // 하위 줄은 자산 열과 금액 열에만 내려온다. 다른 열로 이동했다면 열 배정이 어긋난 것이다.
    if (
      cells.owner !== "" ||
      cells.transaction !== "" ||
      cells.date !== "" ||
      cells.notification !== ""
    )
      invalid();
    if (cells.amount !== "") draft.amount.push(cells.amount);
    if (cells.asset === "") continue;
    const prefixed = ITEM_PREFIX.exec(cells.asset);
    if (!prefixed) {
      // 접두 없는 줄은 직전 필드의 줄바꿈이다. 설명 다음 줄은 설명에, 그 전에는 자산명에 붙인다.
      const last = draft.details.at(-1);
      if (last !== undefined)
        draft.details[draft.details.length - 1] = `${last} ${cells.asset}`;
      else if (draft.filingStatus !== null) invalid();
      else draft.asset.push(cells.asset);
      continue;
    }
    if (prefixed[1] === "F S") {
      const status = prefixed[2].trim();
      if (draft.filingStatus !== null || status === "") invalid();
      draft.filingStatus = status;
      continue;
    }
    // 설명 줄은 공식 접두("D:", "L:", "C:")를 유지한다. 이 서식은 추출 패딩(NUL)이 콜론 앞
    // 공백으로 남으므로 접두와 본문을 한 칸으로 다시 붙여 원문 표기로 되돌린다.
    draft.details.push(`${prefixed[1]}: ${prefixed[2]}`.trim());
  }
  // 표 종료 각주를 확인하지 못하면 표 밖 문단을 거래 행으로 읽었을 수 있으므로 전체를 실패시킨다.
  if (!ended) invalid();
  if (draft) transactions.push(finalize(draft));
  if (transactions.length === 0 || transactions.length > 500) invalid();

  return {
    documentId: input.documentId,
    filerName: HOUSE_PTR_FILER_NAME,
    filerStatus: HOUSE_PTR_FILER_STATUS,
    stateDistrict: input.stateDistrict,
    filingDate: input.filingDate,
    signedAt: normalizeHouseDate(signatureDate),
    transactions,
  };
}
