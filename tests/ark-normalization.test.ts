import assert from "node:assert/strict";
import test from "node:test";
import { parseArkHoldingsCsv } from "../src/server/ingestion/ark/parse";

const header =
  "date,fund,company,ticker,cusip,shares,market value ($),weight (%)";
const rows = [
  '09/14/2026,ARKK,"Example, Class A",ABC UQ,123456789,"1,000.125","$1,234.56",61.73%',
  "09/14/2026,ARKK,Cash fund,,X9USDGSFT,500,$500.00,25.00%",
  "09/14/2026,ARKK,Other asset,OTHER,987654321,12,$265.44,13.27%",
];
const footer =
  '"Investors should carefully consider the investment objectives. Holdings are subject to change without notice."';
const source = [header, ...rows, footer].join("\r\n");

test("CSV 인용·소수 수량·센트 금액과 원문 티커 및 비표준 식별자를 보존한다", () => {
  const parsed = parseArkHoldingsCsv(source, "ARKK");
  assert.equal(parsed.reportDate, "2026-09-14");
  assert.equal(parsed.holdings[0].company, "Example, Class A");
  assert.equal(parsed.holdings[0].shares, "1000.125");
  assert.equal(parsed.holdings[0].valueUsd, "1234.56");
  assert.equal(parsed.holdings[0].ticker, "ABC UQ");
  assert.equal(parsed.holdings[1].ticker, null);
  assert.equal(parsed.holdings[1].identifier, "X9USDGSFT");
});

test("행 경계나 인용 필드 중간에서 잘린 CSV를 전체 보유로 받아들이지 않는다", () => {
  assert.throws(() =>
    parseArkHoldingsCsv([header, ...rows].join("\n"), "ARKK"),
  );
  assert.throws(() =>
    parseArkHoldingsCsv(`${header}\n${rows[0].slice(0, -10)}`, "ARKK"),
  );
  assert.throws(() => parseArkHoldingsCsv(`${source}\n${rows[0]}`, "ARKK"));
});

test("한 스냅샷에 다른 펀드·기준일·중복 자산이 섞이면 반영하지 않는다", () => {
  assert.throws(() =>
    parseArkHoldingsCsv(source.replace("ARKK", "ARKW"), "ARKK"),
  );
  assert.throws(() =>
    parseArkHoldingsCsv(source.replace("09/14/2026", "09/13/2026"), "ARKK"),
  );
  assert.throws(() =>
    parseArkHoldingsCsv([header, ...rows, rows[0], footer].join("\n"), "ARKK"),
  );
});

test("반올림 비중은 허용하되 누락 금액·열 밀림을 숨기는 비중 모순은 거부한다", () => {
  const rounded = parseArkHoldingsCsv(
    source.replace("13.27%", "13.28%"),
    "ARKK",
  );
  assert.equal(rounded.holdings[2].weightPercent, "13.28");
  assert.throws(() =>
    parseArkHoldingsCsv(source.replace("$1,234.56", "$1,000.00"), "ARKK"),
  );
  assert.throws(() =>
    parseArkHoldingsCsv(source.replace("61.73%", "80.00%"), "ARKK"),
  );
});
