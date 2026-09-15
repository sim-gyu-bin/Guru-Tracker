import {
  addDecimalStrings,
  formatScaledDecimal,
  parseScaledDecimal,
  ratioToPercent,
} from "../lib/decimal";
import type { ArkHolding } from "./ark";

/** ARK 원문 평가금액은 센트 두 자리 USD 십진이므로 집계 스케일을 2로 고정한다. */
const USD_CENT_SCALE = 2;

/** 차트와 목록에 표시할 ARK 한 펀드의 포지션 구성 항목이다. */
export interface ArkAllocationItem {
  /** 같은 펀드 안에서 같은 id일 때만 병합하므로 id를 항목 키로 쓴다. */
  key: string;
  company: string;
  /** 원문 티커를 그대로 보존한다(예: "RKLB UQ"). 공백 접미사를 떼거나 추측하지 않는다. */
  ticker: string | null;
  identifier: string;
  /** 병합한 원문 수량의 십진 문자열이다. 주식·현금·비상장 자산을 임의 분류하지 않는다. */
  shares: string;
  /** 센트까지 보존한 평가금액 USD 십진 문자열이다. 음수도 원문 그대로 유지한다. */
  valueUsd: string;
  /** ARK가 공개한 공식 비중의 합이다. 반올림된 값이라 합계가 정확히 100%가 아닐 수 있다. */
  weightPercent: string;
  /** 평가금액에서 다시 계산한 차트 전용 비중이다. 공식 비중과 다를 수 있다. */
  percent: number;
  positionCount: number;
  isOther: boolean;
}

/**
 * 한 ARK 펀드 스냅샷의 평가금액 구성이다.
 * 티커가 없는 자산도 집계에서 제외하지 않고, 음수 평가액이 있으면 도넛 대신 목록만 보여 준다.
 */
export interface ArkAllocation {
  /** 음수를 포함한 정확한 순 평가금액이다. */
  totalValueUsd: string;
  topItemsValueUsd: string;
  topItemsPercent: number;
  itemCount: number;
  /** 원문 행에 음수 평가금액이 있어 비중 도넛을 그릴 수 없으면 true다. */
  hasNegativeValue: boolean;
  items: ArkAllocationItem[];
}

type AggregatedHolding = Omit<
  ArkAllocationItem,
  "valueUsd" | "percent" | "isOther"
> & {
  value: bigint;
};

const TOP_ITEM_LIMIT = 5;

/** 평가금액 내림차순, 같으면 id 오름차순으로 정렬해 순위를 결정적으로 만든다. */
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
 * ARK 공식 보유 항목을 평가금액 기준 상위 5개와 기타로 집계한다.
 * 같은 펀드 안에서 같은 id인 행만 병합하며, 유사한 회사명·식별자를 임의로 합치지 않는다.
 * 평가금액은 센트 정수 BigInt로, 수량과 공식 비중은 원문 십진 문자열로 합쳐 정밀도를 유지한다.
 * 원문 행의 음수 평가금액은 hasNegativeValue로만 표시하고 값을 누락하거나 정규화하지 않는다.
 * 잘못된 USD 문자열은 RangeError로 실패하고, 양수 평가금액 합계가 0이면 빈 items를 반환한다.
 */
export function buildArkAllocation(holdings: ArkHolding[]): ArkAllocation {
  const positions = new Map<string, AggregatedHolding>();
  // 원문 행 자체에 음수 평가금액이 있는지 기록한다. 집계 뒤 값을 보면 중복 id 병합에 가려질 수 있다.
  let hasNegativeValue = false;

  for (const holding of holdings) {
    const value = parseScaledDecimal(holding.valueUsd, USD_CENT_SCALE);

    if (value < BigInt(0)) {
      hasNegativeValue = true;
    }

    const existing = positions.get(holding.id);

    if (existing) {
      existing.value += value;
      existing.shares = addDecimalStrings(existing.shares, holding.shares);
      existing.weightPercent = addDecimalStrings(
        existing.weightPercent,
        holding.weightPercent,
      );
      existing.positionCount += 1;
      continue;
    }

    positions.set(holding.id, {
      key: holding.id,
      company: holding.company,
      ticker: holding.ticker,
      identifier: holding.identifier,
      shares: holding.shares,
      weightPercent: holding.weightPercent,
      value,
      positionCount: 1,
    });
  }

  const sortedPositions = [...positions.values()].sort(compareByValueThenKey);
  const totalValue = sortedPositions.reduce(
    (sum, position) => sum + position.value,
    BigInt(0),
  );
  const positivePositions = sortedPositions.filter(
    (position) => position.value > BigInt(0),
  );
  const positiveTotal = positivePositions.reduce(
    (sum, position) => sum + position.value,
    BigInt(0),
  );

  if (positiveTotal === BigInt(0)) {
    return {
      totalValueUsd: formatScaledDecimal(totalValue, USD_CENT_SCALE),
      topItemsValueUsd: "0.00",
      topItemsPercent: 0,
      itemCount: 0,
      hasNegativeValue,
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
  const items: ArkAllocationItem[] = topPositions.map((position) => ({
    key: position.key,
    company: position.company,
    ticker: position.ticker,
    identifier: position.identifier,
    shares: position.shares,
    valueUsd: formatScaledDecimal(position.value, USD_CENT_SCALE),
    weightPercent: position.weightPercent,
    percent: ratioToPercent(position.value, positiveTotal),
    positionCount: position.positionCount,
    isOther: false,
  }));

  if (otherValue > BigInt(0)) {
    items.push({
      key: "other",
      company: "기타",
      ticker: null,
      identifier: "기타 보유 항목",
      shares: "—",
      valueUsd: formatScaledDecimal(otherValue, USD_CENT_SCALE),
      weightPercent: otherPositions.reduce(
        (sum, position) => addDecimalStrings(sum, position.weightPercent),
        "0",
      ),
      percent: ratioToPercent(otherValue, positiveTotal),
      positionCount: otherPositions.length,
      isOther: true,
    });
  }

  return {
    totalValueUsd: formatScaledDecimal(totalValue, USD_CENT_SCALE),
    topItemsValueUsd: formatScaledDecimal(topItemsValue, USD_CENT_SCALE),
    topItemsPercent: ratioToPercent(topItemsValue, positiveTotal),
    itemCount: topPositions.length,
    hasNegativeValue,
    items,
  };
}
