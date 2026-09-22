import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import test from "node:test";
import type { SecManager } from "../src/domain/sec";
import { collectSec } from "../src/server/sec";

/**
 * 픽스처가 재현하는 제출자 신원이다. 서버 대상 설정과 독립적으로 적어 두어
 * 대상 혼입 거부와 원문 경로가 실제 설정 값과 어긋나면 이 테스트가 먼저 깨지게 한다.
 * 실제 수집 성공은 공식 SEC 원문으로 별도 검증하며 합성 XML을 그 증거로 쓰지 않는다.
 */
const TARGETS: Record<
  SecManager,
  { cik: string; archiveCik: string; name: string }
> = {
  stanley: {
    cik: "0001536411",
    archiveCik: "1536411",
    name: "Duquesne Family Office LLC",
  },
  burry: {
    cik: "0001649339",
    archiveCik: "1649339",
    name: "Scion Asset Management, LLC",
  },
  laffont: {
    cik: "0001135730",
    archiveCik: "1135730",
    name: "COATUE MANAGEMENT LLC",
  },
  gerstner: {
    cik: "0001541617",
    archiveCik: "1541617",
    name: "Altimeter Capital Management, LP",
  },
  tepper: {
    cik: "0001656456",
    archiveCik: "1656456",
    name: "Appaloosa LP",
  },
  aschenbrenner: {
    cik: "0002045724",
    archiveCik: "2045724",
    name: "Situational Awareness LP",
  },
};

type RowFixture = {
  issuer?: string;
  cusip?: string;
  value: string;
  shares?: string;
  shareType?: string;
  putCall?: "Put" | "Call" | null;
};

type FilingFixture = {
  accession: string;
  filingDate: string;
  reportDate: string;
  value: string;
  rows?: RowFixture[];
  amendment?: "RESTATEMENT" | "NEW HOLDINGS";
  amendmentNumber?: number;
  tableOverride?: string;
  coverOverride?: string;
  primaryDocument?: string;
};

type IdentityOverride = {
  submissionsCik?: string;
  submissionsName?: string;
  coverCik?: string;
  coverName?: string;
};

function rowXml(row: RowFixture) {
  const quantity = `<shrsOrPrnAmt><sshPrnamt>${row.shares ?? "9007199254740993"}</sshPrnamt><sshPrnamtType>${row.shareType ?? "SH"}</sshPrnamtType></shrsOrPrnAmt>`;
  const putCall = row.putCall ? `<putCall>${row.putCall}</putCall>` : "";
  return `<infoTable><nameOfIssuer>${row.issuer ?? "TEST &amp; COMPANY"}</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>${row.cusip ?? "123456789"}</cusip><value>${row.value}</value>${quantity}${putCall}</infoTable>`;
}

function documents(
  manager: SecManager,
  filings: FilingFixture[],
  override: IdentityOverride = {},
) {
  const target = TARGETS[manager];
  // 합성 XML은 외부 의미의 경계 검증용이며 실제 수집 성공의 증거로 쓰지 않는다.
  const responses = new Map<string, string>();
  responses.set(
    `https://data.sec.gov/submissions/CIK${target.cik}.json`,
    JSON.stringify({
      cik: override.submissionsCik ?? target.cik,
      name: override.submissionsName ?? target.name,
      filings: {
        recent: {
          form: filings.map((f) => (f.amendment ? "13F-HR/A" : "13F-HR")),
          accessionNumber: filings.map((f) => f.accession),
          reportDate: filings.map((f) => f.reportDate),
          filingDate: filings.map((f) => f.filingDate),
          primaryDocument: filings.map(
            (f) => f.primaryDocument ?? "xslForm13F_X02/primary_doc.xml",
          ),
        },
      },
    }),
  );
  for (const f of filings) {
    const base = `https://www.sec.gov/Archives/edgar/data/${target.archiveCik}/${f.accession.replaceAll("-", "")}`;
    responses.set(
      `${base}/primary_doc.xml`,
      f.coverOverride ??
        `<edgarSubmission><headerData><submissionType>${f.amendment ? "13F-HR/A" : "13F-HR"}</submissionType><filerInfo><filer><credentials><cik>${override.coverCik ?? target.cik}</cik></credentials></filer></filerInfo></headerData><formData><coverPage><reportCalendarOrQuarter>${f.reportDate}</reportCalendarOrQuarter><filingManager><name>${override.coverName ?? target.name}</name></filingManager><reportType>13F HOLDINGS REPORT</reportType><isAmendment>${Boolean(f.amendment)}</isAmendment>${f.amendment ? `<amendmentNo>${f.amendmentNumber ?? 1}</amendmentNo><amendmentInfo><amendmentType>${f.amendment}</amendmentType></amendmentInfo>` : ""}</coverPage><summaryPage><isConfidentialOmitted>false</isConfidentialOmitted><tableEntryTotal>${f.rows?.length ?? 1}</tableEntryTotal><tableValueTotal>${f.value}</tableValueTotal></summaryPage></formData></edgarSubmission>`,
    );
    responses.set(
      `${base}/index.json`,
      JSON.stringify({
        directory: {
          item: [{ name: "primary_doc.xml" }, { name: "table.xml" }],
        },
      }),
    );
    responses.set(
      `${base}/table.xml`,
      f.tableOverride ??
        `<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">${(f.rows ?? [{ value: f.value }]).map(rowXml).join("")}</informationTable>`,
    );
  }
  return responses;
}

/**
 * 픽스처에 없는 URL은 즉시 실패시킨다. 원문 경로가 대상별 Archive CIK와 어긋나면 수집이 성공하지 않는다.
 * t는 node:test의 TestContext이며 mock.method로 이 테스트 동안만 전역 fetch를 대체한다.
 */
function mocked(
  t: Pick<TestContext, "mock">,
  source: Map<string, string>,
  status = 200,
): void {
  t.mock.method(globalThis, "fetch", (input: string | URL | Request) => {
    const text = source.get(String(input));
    assert.ok(text, `예상하지 않은 SEC 요청: ${String(input)}`);
    return Promise.resolve(new Response(text, { status }));
  });
}

const recent: FilingFixture = {
  accession: "0001536411-26-000006",
  filingDate: "2026-08-14",
  reportDate: "2026-06-30",
  value: "9007199254740993",
};

test("USD와 큰 정수 수량·옵션을 손실 없이 보존하고 과거 분기 정정이 최신 분기를 덮지 않는다", async (t) => {
  const older: FilingFixture = {
    accession: "0001536411-26-000007",
    filingDate: "2026-08-20",
    reportDate: "2026-03-31",
    value: "1",
    amendment: "RESTATEMENT",
  };
  const legacy: FilingFixture = {
    accession: "0001536411-13-000002",
    filingDate: "2013-05-15",
    reportDate: "2013-03-31",
    value: "1",
    primaryDocument: "q1_2013-13f.txt",
  };
  mocked(
    t,
    documents("stanley", [
      older,
      { ...recent, rows: [{ value: recent.value, putCall: "Put" }] },
      legacy,
    ]),
  );
  const result = await collectSec(
    "stanley",
    "GuruTracker test@example.com",
    AbortSignal.timeout(15_000),
  );
  assert.equal(result.snapshot.reportDate, "2026-06-30");
  assert.equal(result.snapshot.accession, recent.accession);
  assert.equal(result.snapshot.holdings[0].valueUsd, "9007199254740993");
  assert.equal(result.snapshot.holdings[0].shares, "9007199254740993");
  assert.equal(result.snapshot.holdings[0].putCall, "PUT");
  assert.equal(result.snapshot.holdings[0].issuer, "TEST & COMPANY");
});

test("선택 항목 미표시와 반올림 경계는 허용하되 범위를 넘는 합계와 비공개 누락은 거부한다", async (t) => {
  const source = documents("stanley", [{ ...recent, value: "10" }]);
  const base =
    "https://www.sec.gov/Archives/edgar/data/1536411/000153641126000006";
  const cover = source
    .get(`${base}/primary_doc.xml`)!
    .replace("<isConfidentialOmitted>false</isConfidentialOmitted>", "")
    .replace(
      "<tableEntryTotal>1</tableEntryTotal>",
      "<tableEntryTotal>2</tableEntryTotal>",
    )
    .replace(
      "<tableValueTotal>10</tableValueTotal>",
      "<tableValueTotal>21</tableValueTotal>",
    );
  const table = source.get(`${base}/table.xml`)!;
  const row = table.match(/<infoTable>[\s\S]*<\/infoTable>/)![0];
  source.set(
    `${base}/table.xml`,
    table.replace("</informationTable>", `${row}</informationTable>`),
  );
  source.set(`${base}/primary_doc.xml`, cover);
  mocked(t, source);
  const result = await collectSec(
    "stanley",
    "GuruTracker test@example.com",
    AbortSignal.timeout(15_000),
  );
  assert.deepEqual(
    result.snapshot.holdings.map((holding) => holding.valueUsd),
    ["10", "10"],
    "표지 합계에 맞추려고 원문 행 금액을 바꾸지 않는다",
  );
  source.set(
    `${base}/primary_doc.xml`,
    cover.replace(
      "<tableValueTotal>21</tableValueTotal>",
      "<tableValueTotal>22</tableValueTotal>",
    ),
  );
  await assert.rejects(
    collectSec(
      "stanley",
      "GuruTracker test@example.com",
      AbortSignal.timeout(15_000),
    ),
    /SEC_VALIDATION/,
  );
  source.set(
    `${base}/primary_doc.xml`,
    cover.replace(
      "<summaryPage>",
      "<summaryPage><isConfidentialOmitted>true</isConfidentialOmitted>",
    ),
  );
  await assert.rejects(
    collectSec(
      "stanley",
      "GuruTracker test@example.com",
      AbortSignal.timeout(15_000),
    ),
    /SEC_VALIDATION/,
  );
});

test("2023 단위 전환은 보고일이 아닌 제출일을 따르고 이전 천 달러 값을 USD로 환산한다", async (t) => {
  let source = documents("stanley", [
    {
      ...recent,
      filingDate: "2023-01-02",
      reportDate: "2022-09-30",
      value: "12",
    },
  ]);
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request) =>
      new Response(source.get(String(input)) ?? "missing"),
  );
  assert.equal(
    (
      await collectSec(
        "stanley",
        "GuruTracker test@example.com",
        AbortSignal.timeout(15_000),
      )
    ).snapshot.holdings[0].valueUsd,
    "12000",
  );
  source = documents("stanley", [
    {
      ...recent,
      filingDate: "2023-01-03",
      reportDate: "2022-09-30",
      value: "12",
    },
  ]);
  assert.equal(
    (
      await collectSec(
        "stanley",
        "GuruTracker test@example.com",
        AbortSignal.timeout(15_000),
      )
    ).snapshot.holdings[0].valueUsd,
    "12",
  );
});

test("추가 보유 정정은 기존 표에 합치고 재작성 정정은 이전 표를 대체한다", async (t) => {
  const amendment: FilingFixture = {
    ...recent,
    accession: "0001536411-26-000007",
    filingDate: "2026-08-15",
    value: "2",
    amendment: "NEW HOLDINGS",
  };
  let source = documents("stanley", [amendment, { ...recent, value: "1" }]);
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request) =>
      new Response(source.get(String(input)) ?? "missing"),
  );
  assert.deepEqual(
    (
      await collectSec(
        "stanley",
        "GuruTracker test@example.com",
        AbortSignal.timeout(15_000),
      )
    ).snapshot.holdings
      .map((holding) => holding.valueUsd)
      .sort(),
    ["1", "2"],
  );
  source = documents("stanley", [
    { ...amendment, amendment: "RESTATEMENT" },
    { ...recent, value: "1" },
  ]);
  assert.deepEqual(
    (
      await collectSec(
        "stanley",
        "GuruTracker test@example.com",
        AbortSignal.timeout(15_000),
      )
    ).snapshot.holdings.map((holding) => holding.valueUsd),
    ["2"],
  );
});

test("정정 표시 생략은 정정 메타데이터 없는 원본에서만 허용한다", async (t) => {
  const source = documents("stanley", [recent]);
  const primaryUrl =
    "https://www.sec.gov/Archives/edgar/data/1536411/000153641126000006/primary_doc.xml";
  const original = source.get(primaryUrl)!;
  const omitted = original.replace("<isAmendment>false</isAmendment>", "");
  mocked(t, source);
  const explicit = await collectSec(
    "stanley",
    "GuruTracker test@example.com",
    AbortSignal.timeout(15_000),
  );
  source.set(primaryUrl, omitted);
  const implicit = await collectSec(
    "stanley",
    "GuruTracker test@example.com",
    AbortSignal.timeout(15_000),
  );
  // 표지의 false 생략은 원본의 보유·정규화 결과를 바꾸지 않는다.
  assert.deepEqual(implicit.snapshot, explicit.snapshot);
  assert.equal(implicit.normalizedHash, explicit.normalizedHash);

  const amended = documents("stanley", [
    { ...recent, amendment: "RESTATEMENT" },
  ]);
  amended.set(
    primaryUrl,
    amended.get(primaryUrl)!.replace("<isAmendment>true</isAmendment>", ""),
  );
  source.clear();
  for (const [url, body] of amended) source.set(url, body);
  await assert.rejects(
    collectSec(
      "stanley",
      "GuruTracker test@example.com",
      AbortSignal.timeout(15_000),
    ),
    /SEC_VALIDATION/,
    "13F-HR/A는 번호·유형이 있어도 명시적인 정정 표시가 필요하다",
  );

  source.clear();
  for (const [url, body] of documents("stanley", [recent]))
    source.set(url, body);
  // 번호와 정정 정보는 독립적인 모순이다. 둘 중 하나만 있어도 생략된 표시를 원본으로 해석하지 않는다.
  for (const metadata of [
    "<amendmentNo>1</amendmentNo>",
    "<amendmentInfo><amendmentType>RESTATEMENT</amendmentType></amendmentInfo>",
  ]) {
    source.set(
      primaryUrl,
      omitted.replace("</coverPage>", `${metadata}</coverPage>`),
    );
    await assert.rejects(
      collectSec(
        "stanley",
        "GuruTracker test@example.com",
        AbortSignal.timeout(15_000),
      ),
      /SEC_VALIDATION/,
      "원본의 정정 표시 생략과 정정 메타데이터는 함께 허용하지 않는다",
    );
  }
});

test("잘린 정보표와 DTD는 검증에 실패하고 SEC 접근 실패를 데이터로 해석하지 않는다", async (t) => {
  let source = documents("stanley", [
    { ...recent, tableOverride: "<informationTable></informationTable>" },
  ]);
  let status = 200;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request) =>
      new Response(source.get(String(input)) ?? "missing", { status }),
  );
  await assert.rejects(
    collectSec(
      "stanley",
      "GuruTracker test@example.com",
      AbortSignal.timeout(15_000),
    ),
    /SEC_VALIDATION/,
  );
  source = documents("stanley", [
    {
      ...recent,
      coverOverride:
        '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><edgarSubmission>&xxe;</edgarSubmission>',
    },
  ]);
  await assert.rejects(
    collectSec(
      "stanley",
      "GuruTracker test@example.com",
      AbortSignal.timeout(15_000),
    ),
    /SEC_VALIDATION/,
  );
  status = 403;
  await assert.rejects(
    collectSec(
      "stanley",
      "GuruTracker test@example.com",
      AbortSignal.timeout(15_000),
    ),
    /SEC_ACCESS/,
  );
});

test("Burry 정보표의 주식·PUT·CALL 행은 같은 CUSIP이어도 합쳐지지 않고 원문 수량·금액을 유지한다", async (t) => {
  // 실제 Q3 2025 정보표와 같은 8행 구성(주식 4·PUT 2·CALL 2)을 합성 값으로 재현한다.
  // 같은 기초자산을 주식과 옵션으로 함께 보유하므로 CUSIP만으로 합치면 보유가 사라진다.
  const rows: RowFixture[] = [
    { issuer: "STOCK ONE", cusip: "111111111", value: "400000000" },
    { issuer: "STOCK TWO", cusip: "222222222", value: "300000000" },
    { issuer: "STOCK THREE", cusip: "333333333", value: "200000000" },
    { issuer: "STOCK FOUR", cusip: "444444444", value: "100000000" },
    {
      issuer: "OPTION ONE",
      cusip: "111111111",
      value: "150000000",
      shares: "5000000",
      putCall: "Put",
    },
    {
      issuer: "OPTION ONE",
      cusip: "111111111",
      value: "90000000",
      shares: "2500000",
      putCall: "Call",
    },
    {
      issuer: "OPTION TWO",
      cusip: "555555555",
      value: "80000000",
      shares: "1500000",
      putCall: "Put",
    },
    {
      issuer: "OPTION TWO",
      cusip: "555555555",
      value: "61198076",
      shares: "1200000",
      putCall: "Call",
    },
  ];
  const filing: FilingFixture = {
    accession: "0001649339-25-000007",
    filingDate: "2025-11-03",
    reportDate: "2025-09-30",
    value: "1381198076",
    rows,
  };
  mocked(t, documents("burry", [filing]));
  const result = await collectSec(
    "burry",
    "GuruTracker test@example.com",
    AbortSignal.timeout(15_000),
  );
  assert.equal(result.snapshot.cik, "0001649339");
  assert.equal(result.snapshot.managerName, "Scion Asset Management, LLC");
  assert.equal(result.snapshot.holdings.length, 8);
  const counts = result.snapshot.holdings.reduce<Record<string, number>>(
    (acc, holding) => {
      const key = holding.putCall ?? "STOCK";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {},
  );
  assert.deepEqual(counts, { STOCK: 4, PUT: 2, CALL: 2 });
  const option = result.snapshot.holdings.find(
    (holding) => holding.putCall === "PUT" && holding.cusip === "111111111",
  );
  // 옵션 행은 원문에 적힌 기초자산 수량과 평가금액을 그대로 두며 손익을 계산하지 않는다.
  assert.equal(option?.valueUsd, "150000000");
  assert.equal(option?.shares, "5000000");
  assert.equal(option?.shareType, "SH");
  // 원문 경로는 0을 뺀 제출자 CIK를 쓴다. 다른 대상의 Archive 경로로 요청하면 위 mock이 실패한다.
  assert.match(result.snapshot.sourceUrl, /\/data\/1649339\//);
  assert.match(result.snapshot.informationTableUrl, /\/data\/1649339\//);
  assert.ok(result.originals.some((file) => file.name === "submissions.json"));
});

test("대상 설정과 다른 제출자·표지 신원은 수집을 거부한다", async (t) => {
  // Burry 조회에 Stanley 제출자 문서가 오면 정규화 이전에 거부한다.
  mocked(
    t,
    documents("burry", [recent], {
      submissionsCik: "0001536411",
      submissionsName: "Duquesne Family Office LLC",
    }),
  );
  await assert.rejects(
    collectSec(
      "burry",
      "GuruTracker test@example.com",
      AbortSignal.timeout(15_000),
    ),
    /SEC_VALIDATION/,
  );
  // Stanley 조회에 Burry 제출자 문서가 오는 반대 방향도 같다.
  mocked(
    t,
    documents("stanley", [recent], {
      submissionsCik: "0001649339",
      submissionsName: "Scion Asset Management, LLC",
    }),
  );
  await assert.rejects(
    collectSec(
      "stanley",
      "GuruTracker test@example.com",
      AbortSignal.timeout(15_000),
    ),
    /SEC_VALIDATION/,
  );
});

test("제출자 목록이 맞아도 표지의 관리자 이름·CIK가 다르면 거부한다", async (t) => {
  const burryFiling: FilingFixture = {
    accession: "0001649339-25-000007",
    filingDate: "2025-11-03",
    reportDate: "2025-09-30",
    value: "10",
  };
  mocked(
    t,
    documents("burry", [burryFiling], {
      coverName: "Duquesne Family Office LLC",
    }),
  );
  await assert.rejects(
    collectSec(
      "burry",
      "GuruTracker test@example.com",
      AbortSignal.timeout(15_000),
    ),
    /SEC_VALIDATION/,
  );
  mocked(t, documents("burry", [burryFiling], { coverCik: "0001536411" }));
  await assert.rejects(
    collectSec(
      "burry",
      "GuruTracker test@example.com",
      AbortSignal.timeout(15_000),
    ),
    /SEC_VALIDATION/,
  );
});

// 각 대상이 실제로 올리는 13F의 accession 접두사를 쓴다. Aschenbrenner(Situational Awareness LP)의 13F는
// 제출 대행 접수(0000935836)로 올라와 접수 번호 앞자리와 제출자 CIK가 다르므로, 제출자 신원은 submissions의
// 제출자 CIK·이름과 표지 filingManager.name으로만 판정되어야 한다.
const MANAGER_FILINGS = [
  { manager: "laffont", accession: "0001135730-26-000001" },
  { manager: "gerstner", accession: "0001541617-26-000001" },
  { manager: "tepper", accession: "0001656456-26-000001" },
  { manager: "aschenbrenner", accession: "0000935836-26-000418" },
] as const;

for (const { manager, accession } of MANAGER_FILINGS) {
  test(`${manager}는 자기 공식 제출자를 수집하고 다른 기관의 목록·표지는 거부한다`, async (t) => {
    const target = TARGETS[manager];
    const filing = { ...recent, accession };
    // Tepper 공식 표지는 APPALOOSA LP다. 대소문자 차이만 허용하고 DB에는 설정의 정식 이름을 기록한다.
    const source = documents(manager, [filing], {
      coverName: manager === "tepper" ? "APPALOOSA LP" : target.name,
    });
    mocked(t, source);
    const result = await collectSec(
      manager,
      "GuruTracker test@example.com",
      AbortSignal.timeout(15_000),
    );
    assert.equal(result.snapshot.cik, target.cik);
    assert.equal(result.snapshot.managerName, target.name);
    assert.equal(result.snapshot.holdings[0].valueUsd, recent.value);
    // CIK와 이름은 각각 독립적으로 검증해야 한다. 한 필드만 다른 문서도 수집할 수 없다.
    for (const override of [
      { submissionsCik: TARGETS.burry.cik },
      { submissionsName: TARGETS.burry.name },
      { coverCik: TARGETS.burry.cik },
      { coverName: TARGETS.burry.name },
    ]) {
      const invalid = documents(manager, [filing], override);
      source.clear();
      for (const [url, body] of invalid) source.set(url, body);
      await assert.rejects(
        collectSec(
          manager,
          "GuruTracker test@example.com",
          AbortSignal.timeout(15_000),
        ),
        /SEC_VALIDATION/,
      );
    }
  });
}
