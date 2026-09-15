import assert from "node:assert/strict";
import test from "node:test";
import { parseOpenFigiResponse } from "../src/domain/openfigi";

const checkedAt = "2026-09-14T23:00:00.000Z";
const usEquity = {
  figi: "BBG000BVPV84",
  compositeFIGI: "BBG000BVPV84",
  ticker: "AMZN",
  exchCode: "US",
  marketSector: "Equity",
};

test("동일 미국 증권 중복만 합치고 티커·FIGI 충돌과 다른 시장은 미매핑으로 남긴다", () => {
  const cusips = ["023135106", "037833100", "874039100", "46137V357"];
  const result = parseOpenFigiResponse(
    cusips,
    [
      { data: [usEquity, { ...usEquity }] },
      { data: [usEquity, { ...usEquity, ticker: "AMZN.A" }] },
      {
        data: [
          usEquity,
          {
            ...usEquity,
            figi: "BBG000B9XRY4",
            compositeFIGI: "BBG000B9XRY4",
          },
        ],
      },
      { data: [{ ...usEquity, exchCode: "GR" }] },
    ],
    checkedAt,
  );

  assert.deepEqual(Object.keys(result.byCusip), [cusips[0]]);
  assert.equal(result.byCusip[cusips[0]].ticker, "AMZN");
  assert.deepEqual(result.unresolvedCusips, cusips.slice(1));
});

test("응답 누락·공급자 오류·손상된 식별자를 정상 미매핑으로 캐시하지 않는다", () => {
  const cusips = ["023135106"];
  const malformedResponses = [
    [],
    [{ error: "Request limit reached." }],
    [{ data: [usEquity], error: "Provider error." }],
    [{ data: [{ ...usEquity, figi: "invalid" }] }],
    [{ data: [{ ...usEquity, ticker: "" }] }],
  ];

  for (const response of malformedResponses) {
    assert.throws(() => parseOpenFigiResponse(cusips, response, checkedAt));
  }

  const missing = parseOpenFigiResponse(
    cusips,
    [{ warning: "No identifier found." }],
    checkedAt,
  );
  assert.deepEqual(missing.byCusip, {});
  assert.deepEqual(missing.unresolvedCusips, cusips);
});
