import assert from "node:assert/strict";
import test from "node:test";
import type { HousePtrTransaction } from "../src/domain/house";
import { buildHousePtrActivitySummary } from "../src/domain/house-activity";

/**
 * 자산별 활동 요약 집계의 묶음 경계를 검증한다.
 *
 * 집계는 원문 자산명·자산유형 코드·행 수만 쓰므로 픽스처도 그 세 값만 맞추고 나머지 필드는 공통값으로 둔다.
 * 자산명은 공식 PTR 표기 형태(자산명 + 끝 괄호 티커)를 흉내 낸 합성 문자열이며, 묶음 경계(공백 한 칸 차이,
 * 코드 차이)를 확인하려고 변형한 값을 함께 넣는다. 네트워크·DB는 쓰지 않는다.
 */

/** 집계에 쓰이지 않는 나머지 필드의 공통값. */
const BASE: Omit<HousePtrTransaction, "asset" | "assetTypeCode"> = {
  transactionType: "P",
  transactionDate: "2026-01-05",
  notificationDate: "2026-01-06",
  amountRange: "$1,001 - $15,000",
  ownerCode: "",
  filingStatus: null,
  details: [],
};

const BLOOM = "Bloom Energy Corporation Class A Common Stock (BE)";

test("같은 원문 자산명의 주식(ST)·옵션(OP)은 한 항목으로 묶고 다른 코드·다른 이름·비상장은 나눈다", () => {
  const rows: readonly (readonly [string, string])[] = [
    [BLOOM, "ST"],
    [BLOOM, "ST"],
    [BLOOM, "OP"],
    [BLOOM, "AB"],
    [`${BLOOM} `, "ST"],
    [BLOOM, "PS"],
  ];
  const summary = buildHousePtrActivitySummary(
    rows.map(([asset, assetTypeCode]) => ({ ...BASE, asset, assetTypeCode })),
  );

  assert.equal(summary.transactionCount, 6);
  assert.equal(summary.optionTransactionCount, 1);
  assert.equal(summary.maxTransactionCount, 3);
  // 이름과 코드 묶음이 같은 행만 한 항목이므로 4개다(주식+옵션 3행, AB 1행, 비상장 1행, 공백이 다른 이름 1행).
  // 동률 1행 항목은 키순으로 정렬하므로 코드 분류(AB → PS → ST-OP) 순서가 된다.
  // 끝에 공백이 붙은 이름은 자산명을 정규화하지 않으므로 티커 표기로도 읽지 않는다(별도 항목 + null).
  assert.deepEqual(
    summary.items.map((item) => [
      item.asset,
      item.assetTypeCodes,
      item.ticker,
      item.transactionCount,
    ]),
    [
      [BLOOM, ["OP", "ST"], "BE", 3],
      [BLOOM, ["AB"], "BE", 1],
      [BLOOM, ["PS"], null, 1],
      [`${BLOOM} `, ["ST"], null, 1],
    ],
  );
});

test("티커가 같아도 원문 자산명이 다르면 합치지 않는다", () => {
  const summary = buildHousePtrActivitySummary([
    {
      ...BASE,
      asset: "Intel Corporation - Common Stock (INTC)",
      assetTypeCode: "OP",
    },
    {
      ...BASE,
      asset: "Intel Corporation Class B Common Stock (INTC)",
      assetTypeCode: "OP",
    },
  ]);

  assert.equal(summary.items.length, 2);
  assert.deepEqual(
    summary.items.map((item) => [item.asset, item.ticker]),
    [
      ["Intel Corporation - Common Stock (INTC)", "INTC"],
      ["Intel Corporation Class B Common Stock (INTC)", "INTC"],
    ],
  );
});

test("행 수 합은 총 거래 행과 같고 옵션 행은 그 부분집합이다", () => {
  // 최신 공시 규모(7행·자산 3종·옵션 3행, 자산별 4·2·1행)를 합성 입력으로 재현한다.
  // 자산별 코드 배치는 공식 원문 대조값이 아니라 합성한 값이며, 이 테스트는 집계 함수의 행 수와 묶음만 검증한다
  // (공식 데이터 검증이 아니다).
  const rows: readonly (readonly [string, string])[] = [
    [BLOOM, "ST"],
    [BLOOM, "OP"],
    [BLOOM, "ST"],
    [BLOOM, "OP"],
    ["Intel Corporation - Common Stock (INTC)", "OP"],
    ["Intel Corporation - Common Stock (INTC)", "ST"],
    ["REOF XXV, LLC", "AB"],
  ];
  const summary = buildHousePtrActivitySummary(
    rows.map(([asset, assetTypeCode]) => ({ ...BASE, asset, assetTypeCode })),
  );

  assert.equal(summary.transactionCount, 7);
  assert.equal(summary.optionTransactionCount, 3);
  assert.equal(summary.items.length, 3);
  assert.equal(
    summary.items.reduce((sum, item) => sum + item.transactionCount, 0),
    summary.transactionCount,
  );
  assert.deepEqual(
    summary.items.map((item) => [item.asset, item.transactionCount]),
    [
      [BLOOM, 4],
      ["Intel Corporation - Common Stock (INTC)", 2],
      ["REOF XXV, LLC", 1],
    ],
  );
  // 티커 표기가 없는 원문 자산명은 값을 만들지 않는다.
  assert.equal(summary.items[2].ticker, null);
});

test("동률 항목 순서는 입력 순서가 달라도 같고 빈 자료는 빈 요약이 된다", () => {
  const rows: readonly (readonly [string, string])[] = [
    ["Zeta Holdings Common Stock", "ST"],
    ["Alpha Holdings Common Stock", "ST"],
    ["Beta Holdings Common Stock (BETA)", "OP"],
  ];
  const forward = buildHousePtrActivitySummary(
    rows.map(([asset, assetTypeCode]) => ({ ...BASE, asset, assetTypeCode })),
  );
  const reversed = buildHousePtrActivitySummary(
    [...rows]
      .reverse()
      .map(([asset, assetTypeCode]) => ({ ...BASE, asset, assetTypeCode })),
  );

  assert.deepEqual(
    forward.items.map((item) => item.key),
    reversed.items.map((item) => item.key),
  );
  assert.deepEqual(
    forward.items.map((item) => item.asset),
    [
      "Alpha Holdings Common Stock",
      "Beta Holdings Common Stock (BETA)",
      "Zeta Holdings Common Stock",
    ],
  );

  const empty = buildHousePtrActivitySummary([]);
  assert.deepEqual(empty, {
    transactionCount: 0,
    optionTransactionCount: 0,
    items: [],
    maxTransactionCount: 0,
  });
});
