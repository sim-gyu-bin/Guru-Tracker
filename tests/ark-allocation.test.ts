import assert from "node:assert/strict";
import test from "node:test";
import type { ArkHolding } from "../src/domain/ark";
import { buildArkAllocation } from "../src/domain/ark-allocation";
import { formatUsdAmount, parseScaledDecimal } from "../src/lib/decimal";

function holding(
  id: string,
  valueUsd: string,
  overrides: Partial<ArkHolding> = {},
): ArkHolding {
  return {
    id,
    company: id,
    ticker: null,
    identifier: id,
    shares: "1",
    valueUsd,
    weightPercent: "0",
    ...overrides,
  };
}

test("큰 USD 금액의 1센트 차이와 무티커 자산을 보존하고 작은 기타 비중도 0으로 잃지 않는다", () => {
  const result = buildArkAllocation([
    holding("lower", "9007199254740992.01", { weightPercent: "50" }),
    holding("higher", "9007199254740992.02", {
      ticker: "RAW UQ",
      weightPercent: "50",
    }),
    ...["a", "b", "c", "d"].map((id) => holding(id, "0.01")),
  ]);
  assert.equal(result.items[0].key, "higher");
  assert.equal(result.items[1].key, "lower");
  assert.equal(result.items[1].ticker, null);
  assert.equal(result.totalValueUsd, "18014398509481984.07");
  assert.equal(
    formatUsdAmount(parseScaledDecimal(result.totalValueUsd, 2), 2),
    "$18,014,398,509,481,984.07",
  );
  const other = result.items.at(-1);
  assert.ok(other?.isOther);
  assert.equal(other.valueUsd, "0.01");
  assert.ok(other.percent > 0 && other.percent < 0.01);
});

test("상계되거나 음수만 남는 자료도 음수 원문 존재를 숨기지 않고 정확한 순액을 반환한다", () => {
  const offset = buildArkAllocation([
    holding("same", "100.00"),
    holding("same", "-20.01", { shares: "-0.25" }),
  ]);
  assert.equal(offset.totalValueUsd, "79.99");
  assert.equal(offset.hasNegativeValue, true);
  const negative = buildArkAllocation([holding("negative", "-0.01")]);
  assert.equal(negative.totalValueUsd, "-0.01");
  assert.equal(negative.hasNegativeValue, true);
  assert.deepEqual(negative.items, []);
});
