// 실제 Next 서버와 동일하게 비동기 요청 저장소를 먼저 준비한다.
import "next/dist/server/node-environment-baseline";
import assert from "node:assert/strict";
import test from "node:test";
import { parseOpenFigiResponse } from "../src/domain/openfigi";
import type { SecHolding } from "../src/domain/sec";
import { getTickerReference } from "../src/domain/ticker";
import { getHoldingTickers } from "../src/server/tickers";

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

test("소문자 CUSIP도 현재 티커를 찾되 공시 원문 식별자와 체크섬 검증을 보존한다", async (t) => {
  // Next 렌더 바깥에서 외부 캐시만 격리하고 실제 조회·응답 검증 경로를 실행한다.
  const previousCache = Object.getOwnPropertyDescriptor(
    globalThis,
    "__incrementalCache",
  );
  Object.defineProperty(globalThis, "__incrementalCache", {
    configurable: true,
    value: {
      isOnDemandRevalidate: true,
      generateCacheKey: (key: string) => Promise.resolve(key),
      set: () => Promise.resolve(),
    },
  });
  t.after(() => {
    if (previousCache) {
      Object.defineProperty(globalThis, "__incrementalCache", previousCache);
    } else {
      Reflect.deleteProperty(globalThis, "__incrementalCache");
    }
  });
  t.mock.method(
    globalThis,
    "fetch",
    (_input: RequestInfo | URL, init: RequestInit) => {
      const jobs = JSON.parse(String(init.body)) as { idValue: string }[];
      return Promise.resolve(
        Response.json(
          jobs.map(({ idValue }) =>
            idValue === "15675D103"
              ? {
                  data: [
                    {
                      ...usEquity,
                      figi: "BBG00FNFPQH4",
                      compositeFIGI: "BBG00FNFPQH4",
                      ticker: "CBRS",
                    },
                  ],
                }
              : { warning: "No identifier found." },
          ),
        ),
      );
    },
  );
  const holding: SecHolding = {
    issuer: "CEREBRAS SYSTEMS INC",
    titleOfClass: "COM",
    cusip: "15675d103",
    valueUsd: "1596733177",
    shares: "100",
    shareType: "SH",
    putCall: null,
  };
  const result = await getHoldingTickers([
    holding,
    { ...holding, cusip: "15675d104" },
  ]);
  assert.equal(getTickerReference(holding, result.byCusip)?.ticker, "CBRS");
  assert.equal(holding.cusip, "15675d103");
  assert.deepEqual(result.unresolvedCusips, ["15675d104"]);
  assert.deepEqual(result.unavailableCusips, []);
});
