import assert from "node:assert/strict";
import test from "node:test";
import { buildHoldingAllocation } from "../src/domain/holding-allocation";
import type { SecHolding } from "../src/domain/sec";

function holding(overrides: Partial<SecHolding>): SecHolding {
  return {
    issuer: "동일 발행인",
    titleOfClass: "COM",
    cusip: "111111111",
    valueUsd: "100",
    shares: "1",
    shareType: "SH",
    putCall: null,
    ...overrides,
  };
}

test("동일 포지션만 병합하고 증권·옵션·단위를 구분한 상위 5개 뒤에 기타를 둔다", () => {
  const source = [
    holding({}),
    holding({ valueUsd: "50", issuer: "발행인 표기 변형" }),
    holding({ valueUsd: "250", putCall: "CALL" }),
    holding({ valueUsd: "200", putCall: "PUT" }),
    holding({ valueUsd: "300", titleOfClass: "PREF" }),
    holding({ valueUsd: "400", shareType: "PRN" }),
    holding({ valueUsd: "500", cusip: "222222222" }),
    holding({ valueUsd: "10", cusip: "333333333" }),
    holding({ valueUsd: "0", cusip: "444444444" }),
  ];
  const original = structuredClone(source);
  const allocation = buildHoldingAllocation(source);

  assert.equal(allocation.totalValueUsd, "1810");
  assert.equal(allocation.topItemsValueUsd, "1650");
  assert.deepEqual(
    allocation.items
      .filter((item) => !item.isOther)
      .map((item) => item.valueUsd),
    ["500", "400", "300", "250", "200"],
  );
  const other = allocation.items.at(-1);
  assert.equal(other?.isOther, true);
  assert.equal(other.valueUsd, "160");
  assert.equal(other.positionCount, 2);
  assert.ok(
    Math.abs(
      allocation.items.reduce((sum, item) => sum + item.percent, 0) - 100,
    ) < 1e-12,
  );
  assert.deepEqual(source, original);
});

test("큰 정수의 1달러 차이로 순위를 정하고 미세한 양수 비중도 보존한다", () => {
  const large = BigInt(10) ** BigInt(40);
  const allocation = buildHoldingAllocation([
    holding({ cusip: "111111111", valueUsd: large.toString() }),
    holding({ cusip: "999999999", valueUsd: (large + BigInt(1)).toString() }),
    holding({ cusip: "222222222", valueUsd: "1" }),
  ]);

  assert.equal(
    allocation.totalValueUsd,
    (large * BigInt(2) + BigInt(2)).toString(),
  );
  assert.equal(allocation.items[0].cusip, "999999999");
  assert.equal(allocation.items[0].valueUsd, (large + BigInt(1)).toString());
  assert.equal(allocation.items.length, 3);
  assert.equal(
    allocation.items.some((item) => item.isOther),
    false,
  );
  assert.equal(allocation.topItemsPercent, 100);
  const tiny = allocation.items.find((item) => item.cusip === "222222222");
  assert.ok(tiny && tiny.percent > 0 && tiny.percent < 0.01);
});
