import assert from "node:assert/strict";
import test from "node:test";
import { collectStanley } from "../src/server/sec";

type FilingFixture = {
  accession: string;
  filingDate: string;
  reportDate: string;
  value: string;
  amendment?: "RESTATEMENT" | "NEW HOLDINGS";
  amendmentNumber?: number;
  tableOverride?: string;
  coverOverride?: string;
  primaryDocument?: string;
};

function documents(filings: FilingFixture[]) {
  // 합성 XML은 외부 의미의 경계 검증용이며 실제 수집 성공의 증거로 쓰지 않는다.
  const responses = new Map<string, string>();
  responses.set(
    "https://data.sec.gov/submissions/CIK0001536411.json",
    JSON.stringify({
      cik: "0001536411",
      name: "Duquesne Family Office LLC",
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
    const base = `https://www.sec.gov/Archives/edgar/data/1536411/${f.accession.replaceAll("-", "")}`;
    responses.set(
      `${base}/primary_doc.xml`,
      f.coverOverride ??
        `<edgarSubmission><headerData><submissionType>${f.amendment ? "13F-HR/A" : "13F-HR"}</submissionType><filerInfo><filer><credentials><cik>1536411</cik></credentials></filer></filerInfo></headerData><formData><coverPage><reportCalendarOrQuarter>${f.reportDate}</reportCalendarOrQuarter><filingManager><name>Duquesne Family Office LLC</name></filingManager><reportType>13F HOLDINGS REPORT</reportType><isAmendment>${Boolean(f.amendment)}</isAmendment>${f.amendment ? `<amendmentNo>${f.amendmentNumber ?? 1}</amendmentNo><amendmentInfo><amendmentType>${f.amendment}</amendmentType></amendmentInfo>` : ""}</coverPage><summaryPage><isConfidentialOmitted>false</isConfidentialOmitted><tableEntryTotal>1</tableEntryTotal><tableValueTotal>${f.value}</tableValueTotal></summaryPage></formData></edgarSubmission>`,
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
        `<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable"><infoTable><nameOfIssuer>TEST &amp; COMPANY</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>123456789</cusip><value>${f.value}</value><shrsOrPrnAmt><sshPrnamt>9007199254740993</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><putCall>Put</putCall></infoTable></informationTable>`,
    );
  }
  return responses;
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
  const source = documents([older, recent, legacy]);
  t.mock.method(globalThis, "fetch", (input: string | URL | Request) => {
    const text = source.get(String(input));
    assert.ok(text, `예상하지 않은 SEC 요청: ${String(input)}`);
    return Promise.resolve(new Response(text));
  });
  const result = await collectStanley(
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
  const source = documents([{ ...recent, value: "10" }]);
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
  t.mock.method(globalThis, "fetch", (input: string | URL | Request) =>
    Promise.resolve(new Response(source.get(String(input)) ?? "missing")),
  );
  const result = await collectStanley(
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
    collectStanley("GuruTracker test@example.com", AbortSignal.timeout(15_000)),
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
    collectStanley("GuruTracker test@example.com", AbortSignal.timeout(15_000)),
    /SEC_VALIDATION/,
  );
});

test("2023 단위 전환은 보고일이 아닌 제출일을 따르고 이전 천 달러 값을 USD로 환산한다", async (t) => {
  let source = documents([
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
      await collectStanley(
        "GuruTracker test@example.com",
        AbortSignal.timeout(15_000),
      )
    ).snapshot.holdings[0].valueUsd,
    "12000",
  );
  source = documents([
    {
      ...recent,
      filingDate: "2023-01-03",
      reportDate: "2022-09-30",
      value: "12",
    },
  ]);
  assert.equal(
    (
      await collectStanley(
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
  let source = documents([amendment, { ...recent, value: "1" }]);
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request) =>
      new Response(source.get(String(input)) ?? "missing"),
  );
  assert.deepEqual(
    (
      await collectStanley(
        "GuruTracker test@example.com",
        AbortSignal.timeout(15_000),
      )
    ).snapshot.holdings
      .map((holding) => holding.valueUsd)
      .sort(),
    ["1", "2"],
  );
  source = documents([
    { ...amendment, amendment: "RESTATEMENT" },
    { ...recent, value: "1" },
  ]);
  assert.deepEqual(
    (
      await collectStanley(
        "GuruTracker test@example.com",
        AbortSignal.timeout(15_000),
      )
    ).snapshot.holdings.map((holding) => holding.valueUsd),
    ["2"],
  );
});

test("잘린 정보표와 DTD는 검증에 실패하고 SEC 접근 실패를 데이터로 해석하지 않는다", async (t) => {
  let source = documents([
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
    collectStanley("GuruTracker test@example.com", AbortSignal.timeout(15_000)),
    /SEC_VALIDATION/,
  );
  source = documents([
    {
      ...recent,
      coverOverride:
        '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><edgarSubmission>&xxe;</edgarSubmission>',
    },
  ]);
  await assert.rejects(
    collectStanley("GuruTracker test@example.com", AbortSignal.timeout(15_000)),
    /SEC_VALIDATION/,
  );
  status = 403;
  await assert.rejects(
    collectStanley("GuruTracker test@example.com", AbortSignal.timeout(15_000)),
    /SEC_ACCESS/,
  );
});
