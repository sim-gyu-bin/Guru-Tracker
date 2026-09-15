import assert from "node:assert/strict";
import test from "node:test";
import {
  type HousePtrDocumentInput,
  type HousePtrTextItem,
  normalizeHouseDate,
  parseHousePtrDocument,
} from "../src/server/ingestion/house/parse";

/**
 * 합성 PTR 조각으로 좌표 기반 파서의 경계를 검증한다.
 *
 * 실제 하원 PDF를 쓰지 않고 조각의 좌표·문자열만 바꾸므로, 라벨/값 분리·열 배정·페이지 경계·
 * 금액 표기·코드 검증 규칙이 코드에서만 어긋나는 회귀를 잡는다. 네트워크·DB는 쓰지 않는다.
 */

/** 표 밖 값 줄. 실제 서식은 라벨이 왼쪽(x=22), 값이 라벨 오른쪽(x=99)에 오고 조각이 둘뿐이다. */
function outside(y: number, label: string, value: string): HousePtrTextItem[] {
  return [
    { text: label, x: 22, y },
    { text: value, x: 99, y },
  ];
}

/** 페이지마다 반복되는 표 헤더 줄. 열 기준 x는 이 줄에서 읽는다. */
function header(y: number): HousePtrTextItem[] {
  return [
    { text: "ID", x: 10, y },
    { text: "Owner", x: 40, y },
    { text: "Asset", x: 70, y },
    { text: "Transaction", x: 250, y },
    { text: "Date", x: 330, y },
    { text: "Notification", x: 390, y },
    { text: "Amount", x: 470, y },
  ];
}

type Column =
  | "owner"
  | "asset"
  | "transaction"
  | "date"
  | "notification"
  | "amount";

const COLUMN_X: Readonly<Record<Column, number>> = {
  owner: 40,
  asset: 70,
  transaction: 250,
  date: 330,
  notification: 390,
  amount: 470,
};

/** 표 안의 한 줄. 값이 없는 열은 조각을 만들지 않는다. */
function record(
  y: number,
  cells: Partial<Record<Column, string>>,
): HousePtrTextItem[] {
  return (Object.keys(COLUMN_X) as Column[])
    .filter((column) => cells[column] !== undefined)
    .map((column) => ({
      text: cells[column] as string,
      x: COLUMN_X[column],
      y,
    }));
}

/** 표 종료를 알리는 공식 각주 줄. 이 줄을 만나야만 수집이 끝난다. */
function footnote(y: number): HousePtrTextItem[] {
  return [
    {
      text: "* For the complete list of asset type codes, please visit fd.house.gov/reference/asset-type-codes.aspx",
      x: 22,
      y,
    },
  ];
}

const IDENTITY: readonly HousePtrTextItem[] = [
  { text: "Filing ID #20035143", x: 22, y: 700 },
  { text: "P T R", x: 250, y: 690 },
  ...outside(680, "Name:", "Hon. Nancy Pelosi"),
  ...outside(670, "Status:", "Member"),
  ...outside(660, "State/District:", "CA11"),
  ...outside(650, "Digitally Signed:", "Hon. Nancy Pelosi, 8/21/2026"),
];

const IDENTITY_ID = "Filing ID #20035143";

/** 문서 식별 → 헤더 → 거래 행(들) → 각주 한 페이지. 실패 조건은 이 뼈대를 조금씩 바꿔 만든다. */
function minimal(
  cells: Partial<Record<Column, string>>,
  options: {
    readonly rows?: readonly HousePtrTextItem[][];
    readonly closing?: boolean;
    readonly filingId?: string;
  } = {},
): HousePtrDocumentInput {
  const identity = IDENTITY.map((item) =>
    item.text === IDENTITY_ID
      ? { ...item, text: options.filingId ?? IDENTITY_ID }
      : item,
  );
  const extra = (options.rows ?? []).flat();
  return {
    pages: [
      [
        ...identity,
        ...header(640),
        ...record(630, cells),
        ...extra,
        ...(options.closing === false ? [] : footnote(600)),
      ],
    ],
    documentId: "20035143",
    stateDistrict: "CA11",
    filingDate: "2026-08-21",
  };
}

const BLOOM = "Bloom Energy Corporation Class A Common Stock (BE) [ST]";
const INTEL = "Intel Corporation - Common Stock (INTC) [OP]";

test("거래 행은 페이지 경계를 넘어 이어지고 설명·금액 줄바꿈을 원문 표기로 복원한다", () => {
  const document = parseHousePtrDocument({
    pages: [
      [
        ...IDENTITY,
        ...header(640),
        ...record(630, {
          owner: "SP",
          asset: BLOOM,
          transaction: "P",
          date: "7/24/2026",
          notification: "7/24/2026",
          amount: "$1,000,001 - $5,000,000",
        }),
        // 추출 패딩(NUL)이 콜론 앞 공백으로 남은 실제 형태. 접두는 "D:"로 되돌려야 한다.
        ...record(620, { asset: "D : Purchased 10,000 shares." }),
        ...record(610, {
          owner: "SP",
          asset: INTEL,
          transaction: "P",
          date: "7/24/2026",
          notification: "7/24/2026",
          // 금액 범위가 두 줄로 갈라진 형태. 두 조각을 이어 붙여 원문 표기로 만든다.
          amount: "$250,001",
        }),
        ...record(600, {
          asset: "D : Purchased 50 call options with a strike",
          amount: "- $500,000",
        }),
      ],
      [
        ...header(700),
        // 다음 페이지 첫 줄은 접두 없는 설명 줄이다. 페이지가 바뀌어도 같은 거래 행에 붙는다.
        ...record(690, {
          asset: "price of $50 and an expiration date of 6/17/27.",
        }),
        ...footnote(680),
      ],
    ],
    documentId: "20035143",
    stateDistrict: "CA11",
    filingDate: "2026-08-21",
  });

  assert.deepEqual(document, {
    documentId: "20035143",
    filerName: "Hon. Nancy Pelosi",
    filerStatus: "Member",
    stateDistrict: "CA11",
    filingDate: "2026-08-21",
    signedAt: "2026-08-21",
    transactions: [
      {
        asset: "Bloom Energy Corporation Class A Common Stock (BE)",
        assetTypeCode: "ST",
        transactionType: "P",
        transactionDate: "2026-07-24",
        notificationDate: "2026-07-24",
        amountRange: "$1,000,001 - $5,000,000",
        ownerCode: "SP",
        filingStatus: null,
        details: ["D: Purchased 10,000 shares."],
      },
      {
        asset: "Intel Corporation - Common Stock (INTC)",
        assetTypeCode: "OP",
        transactionType: "P",
        transactionDate: "2026-07-24",
        notificationDate: "2026-07-24",
        amountRange: "$250,001 - $500,000",
        ownerCode: "SP",
        filingStatus: null,
        details: [
          "D: Purchased 50 call options with a strike price of $50 and an expiration date of 6/17/27.",
        ],
      },
    ],
  });
});

test("F S 줄은 제출 상태로, 소유자 기재 생략은 본인 보유로 구분한다", () => {
  const document = parseHousePtrDocument(
    minimal(
      {
        asset: "REOF XXV, LLC [AB]",
        transaction: "P",
        date: "7/27/2026",
        amount: "Over $1,000,000",
      },
      { rows: [record(620, { asset: "F S : New" })] },
    ),
  );

  assert.equal(document.transactions.length, 1);
  const [transaction] = document.transactions;
  assert.equal(transaction.ownerCode, "", "본인 보유는 소유자 코드를 생략한다");
  assert.equal(transaction.filingStatus, "New");
  assert.equal(transaction.notificationDate, null);
  assert.equal(transaction.amountRange, "Over $1,000,000");
  assert.equal(transaction.assetTypeCode, "AB");
});

test("F S 줄이 한 거래 행에 두 번 나오면 전체를 실패시킨다", () => {
  assert.throws(
    () =>
      parseHousePtrDocument(
        minimal(
          {
            asset: "REOF XXV, LLC [AB]",
            transaction: "P",
            date: "7/27/2026",
            amount: "Over $1,000,000",
          },
          {
            rows: [
              record(620, { asset: "F S : New" }),
              record(610, { asset: "F S : Amended" }),
            ],
          },
        ),
      ),
    /HOUSE_VALIDATION/,
  );
});

test("공식 정의에 없는 코드와 표기, 문서 식별 불일치는 부분 수용 없이 실패한다", () => {
  const cases: readonly (readonly [string, HousePtrDocumentInput])[] = [
    [
      "공식 자산유형 코드표에 없는 코드",
      minimal({
        asset: "Test asset [ZZ]",
        transaction: "P",
        date: "7/24/2026",
        amount: "$1,001 - $15,000",
      }),
    ],
    [
      "정의되지 않은 거래유형",
      minimal({
        asset: "Test asset [ST]",
        transaction: "X",
        date: "7/24/2026",
        amount: "$1,001 - $15,000",
      }),
    ],
    [
      "원문에 없는 금액 표기",
      minimal({
        asset: "Test asset [ST]",
        transaction: "P",
        date: "7/24/2026",
        amount: "약 1억원",
      }),
    ],
    [
      "표 종료 각주 없이 끝나는 표",
      minimal(
        {
          asset: "Test asset [ST]",
          transaction: "P",
          date: "7/24/2026",
          amount: "$1,001 - $15,000",
        },
        { closing: false },
      ),
    ],
    [
      "다른 문서번호의 Filing ID",
      minimal(
        {
          asset: "Test asset [ST]",
          transaction: "P",
          date: "7/24/2026",
          amount: "$1,001 - $15,000",
        },
        { filingId: "Filing ID #20035144" },
      ),
    ],
    [
      "존재하지 않는 날짜",
      minimal({
        asset: "Test asset [ST]",
        transaction: "P",
        date: "2/30/2026",
        amount: "$1,001 - $15,000",
      }),
    ],
  ];

  for (const [label, input] of cases) {
    assert.throws(
      () => parseHousePtrDocument(input),
      /HOUSE_VALIDATION/,
      label,
    );
  }
});

test("날짜는 원문 M/D/YYYY만 YYYY-MM-DD로 바꾸고 다른 표기는 거부한다", () => {
  assert.equal(normalizeHouseDate("7/4/2026"), "2026-07-04");
  for (const raw of ["2026-07-04", "7/4/26", "13/4/2026", "2/30/2026", ""]) {
    assert.throws(() => normalizeHouseDate(raw), /HOUSE_VALIDATION/, raw);
  }
});
