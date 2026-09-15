import { ratioToPercent } from "../lib/decimal";
import type { SecHolding } from "./sec";

/**
 * 차트와 목록에 표시할 하나의 13F 평가금액 구성 항목이다.
 * 금액은 USD 정수 문자열로 보존하며, percent만 BigInt 비율 계산 뒤 0~100 범위 number로 전달한다.
 */
export interface HoldingAllocationItem {
  key: string;
  issuer: string;
  titleOfClass: string;
  cusip: string;
  putCall: SecHolding["putCall"];
  shareType: SecHolding["shareType"];
  valueUsd: string;
  percent: number;
  positionCount: number;
  isOther: boolean;
}

/**
 * 한 13F 스냅샷의 평가금액 구성이다. 모든 금액은 USD 정수 문자열이며 원본 보유 항목은 변경하지 않는다.
 * totalValueUsd가 "0"이면 items는 비어 있어 차트를 그리지 않아야 한다.
 */
export interface HoldingAllocation {
  totalValueUsd: string;
  topItemsValueUsd: string;
  topItemsPercent: number;
  itemCount: number;
  items: HoldingAllocationItem[];
}

type AggregatedHolding = Omit<
  HoldingAllocationItem,
  "valueUsd" | "percent" | "isOther"
> & {
  value: bigint;
};

const TOP_ITEM_LIMIT = 5;

/**
 * SEC 원문 금액 문자열을 음수가 아닌 USD 정수로 해석한다.
 * 13F 평가금액은 정수여야 하므로 빈 값·소수·음수·비숫자 값은 잘못된 정규화 데이터로 보고 실패한다.
 */
function parseValueUsd(valueUsd: string): bigint {
  if (!/^\d+$/.test(valueUsd)) {
    throw new RangeError(
      `13F 평가금액이 유효한 USD 정수가 아닙니다: ${valueUsd}`,
    );
  }

  return BigInt(valueUsd);
}

function createPositionKey(holding: SecHolding): string {
  return [
    holding.cusip,
    holding.titleOfClass,
    holding.putCall ?? "",
    holding.shareType,
  ].join("\u0000");
}

function compareByValueThenKey(
  left: AggregatedHolding,
  right: AggregatedHolding,
): number {
  if (left.value !== right.value) {
    return left.value > right.value ? -1 : 1;
  }

  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}

/**
 * SEC 13F 보유 항목을 평가금액 기준 상위 5개와 기타로 집계한다.
 * CUSIP·종목구분·PUT/CALL·보유단위가 같은 항목만 병합하므로 동일 발행인의 주식과 옵션은 절대 섞지 않는다.
 * 잘못된 USD 금액 문자열은 RangeError로 실패하며, 빈 자료 또는 총액 0은 빈 items로 반환한다.
 */
export function buildHoldingAllocation(
  holdings: SecHolding[],
): HoldingAllocation {
  const positions = new Map<string, AggregatedHolding>();

  for (const holding of holdings) {
    const key = createPositionKey(holding);
    const value = parseValueUsd(holding.valueUsd);
    const existing = positions.get(key);

    if (existing) {
      existing.value += value;
      existing.positionCount += 1;
      continue;
    }

    positions.set(key, {
      key,
      issuer: holding.issuer,
      titleOfClass: holding.titleOfClass,
      cusip: holding.cusip,
      putCall: holding.putCall,
      shareType: holding.shareType,
      value,
      positionCount: 1,
    });
  }

  const positivePositions = [...positions.values()]
    .filter((position) => position.value > BigInt(0))
    .sort(compareByValueThenKey);
  const total = positivePositions.reduce(
    (sum, position) => sum + position.value,
    BigInt(0),
  );

  if (total === BigInt(0)) {
    return {
      totalValueUsd: "0",
      topItemsValueUsd: "0",
      topItemsPercent: 0,
      itemCount: 0,
      items: [],
    };
  }

  const topPositions = positivePositions.slice(0, TOP_ITEM_LIMIT);
  const otherPositions = positivePositions.slice(TOP_ITEM_LIMIT);
  const topItemsValue = topPositions.reduce(
    (sum, position) => sum + position.value,
    BigInt(0),
  );
  const otherValue = otherPositions.reduce(
    (sum, position) => sum + position.value,
    BigInt(0),
  );
  const items: HoldingAllocationItem[] = topPositions.map((position) => ({
    key: position.key,
    issuer: position.issuer,
    titleOfClass: position.titleOfClass,
    cusip: position.cusip,
    putCall: position.putCall,
    shareType: position.shareType,
    valueUsd: position.value.toString(),
    percent: ratioToPercent(position.value, total),
    positionCount: position.positionCount,
    isOther: false,
  }));

  if (otherValue > BigInt(0)) {
    items.push({
      key: "other",
      issuer: "기타",
      titleOfClass: "기타 보유종목",
      cusip: "",
      putCall: null,
      shareType: "SH",
      valueUsd: otherValue.toString(),
      percent: ratioToPercent(otherValue, total),
      positionCount: otherPositions.length,
      isOther: true,
    });
  }

  return {
    totalValueUsd: total.toString(),
    topItemsValueUsd: topItemsValue.toString(),
    topItemsPercent: ratioToPercent(topItemsValue, total),
    itemCount: topPositions.length,
    items,
  };
}
