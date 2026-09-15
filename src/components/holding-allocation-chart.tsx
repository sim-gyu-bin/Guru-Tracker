import { AllocationChart } from "@/components/allocation-chart";
import type {
  HoldingAllocation,
  HoldingAllocationItem,
} from "@/domain/holding-allocation";
import type { AllocationChartView } from "@/domain/portfolio-allocation";
import { getTickerReference, type TickerLookup } from "@/domain/ticker";
import { formatUsdAmount } from "@/lib/decimal";

/** 13F 한 항목의 옵션 구분·종류·식별자·보유단위를 목록 보조 줄로 만든다. */
function describeSecurity(item: HoldingAllocationItem): string {
  if (item.isOther) {
    return `원래 포지션 ${item.positionCount}개`;
  }

  return [
    item.putCall ?? "비옵션",
    item.titleOfClass,
    item.cusip,
    item.shareType,
  ].join(" · ");
}

/**
 * 서버에서 BigInt로 집계한 13F 평가금액 구성을 공통 차트 컴포넌트가 쓰는 표시 값으로 변환한다.
 * 금액은 원문 USD 정수를 그대로 통화 표기하고, 티커는 OpenFIGI의 현재 참조 매핑만 사용한다.
 * 공시 기준일의 금액만 다루며, 총액 0 또는 빈 공시는 안내 문구로 대신한다.
 */
export function HoldingAllocationChart({
  allocation,
  reportDate,
  tickers,
}: {
  allocation: HoldingAllocation;
  reportDate: string;
  tickers: TickerLookup["byCusip"];
}) {
  const view: AllocationChartView = {
    slices: allocation.items.map((item) => ({
      key: item.key,
      label: item.issuer,
      ticker: item.isOther
        ? null
        : (getTickerReference(item, tickers)?.ticker ?? null),
      detail: describeSecurity(item),
      amountLabel: formatUsdAmount(BigInt(item.valueUsd), 0),
      percent: item.percent,
      isOther: item.isOther,
    })),
    topLabel: `상위 ${allocation.itemCount}개`,
    topPercent: allocation.topItemsPercent,
    emptyMessage: "이 공시에는 평가금액이 있는 보유종목이 없습니다.",
  };

  return (
    <AllocationChart
      headingId="holding-allocation-title"
      title="13F 공시 평가금액 구성"
      subtitle={`기준일 ${reportDate}`}
      totalLabel={`합계 ${formatUsdAmount(BigInt(allocation.totalValueUsd), 0)}`}
      view={view}
      footnotes={[
        "SEC 공시 금액 기준이며 현재 전체 자산 배분이 아닙니다.",
        "PUT/CALL 금액은 옵션 매입원금·프리미엄이나 손익을 뜻하지 않으며, 주식·PUT·CALL을 구분해 집계합니다.",
      ]}
    />
  );
}
