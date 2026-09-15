import { AllocationChart } from "@/components/allocation-chart";
import type { ArkAllocation, ArkAllocationItem } from "@/domain/ark-allocation";
import type { AllocationChartView } from "@/domain/portfolio-allocation";
import {
  formatDecimalString,
  formatUsdAmount,
  parseScaledDecimal,
} from "@/lib/decimal";

/** ARK 원문 평가금액은 센트 두 자리 USD 십진이므로 표시도 같은 스케일을 쓴다. */
const USD_CENT_SCALE = 2;

/**
 * ARK 한 항목의 원문 식별자·수량·공식 비중을 목록 보조 줄로 만든다.
 * 공식 비중은 ARK가 공개한 원문 값이며 차트 비중(평가금액 재계산)과 다른 값이다.
 */
function describeHolding(item: ArkAllocationItem): string {
  const parts = [item.identifier];

  if (!item.isOther) {
    parts.push(`수량 ${formatDecimalString(item.shares)}`);
  }

  parts.push(`공식 비중 ${formatDecimalString(item.weightPercent)}%`);

  return parts.join(" · ");
}

/**
 * ARK 펀드의 공식 보유 자료를 공통 차트 컴포넌트가 쓰는 표시 값으로 변환한다.
 * 금액은 센트 정수 BigInt를 거쳐 정확히 표시하고, 티커는 원문 문자열을 그대로 쓰며 추측하지 않는다.
 * 음수 평가액이 섞인 자료는 양수 기준 비중 구성으로 표현할 수 없으므로 차트 영역 전체를 안내로 대체한다.
 */
export function ArkAllocationChart({
  allocation,
  fundName,
  reportDate,
}: {
  allocation: ArkAllocation;
  fundName: string;
  reportDate: string;
}) {
  const view: AllocationChartView = {
    slices: allocation.items.map((item) => ({
      key: item.key,
      label: item.company,
      ticker: item.ticker,
      detail: describeHolding(item),
      amountLabel: formatUsdAmount(
        parseScaledDecimal(item.valueUsd, USD_CENT_SCALE),
        USD_CENT_SCALE,
      ),
      percent: item.percent,
      isOther: item.isOther,
    })),
    topLabel: `상위 ${allocation.itemCount}개`,
    topPercent: allocation.topItemsPercent,
    emptyMessage: "이 펀드 자료에는 평가금액이 있는 보유 항목이 없습니다.",
    unavailableMessage: allocation.hasNegativeValue
      ? "음수 평가금액이 있는 자료는 양수 기준 보유 비중으로 표현할 수 없습니다. 아래 보유 항목 표에서 원문 금액을 확인하세요."
      : undefined,
  };

  return (
    <AllocationChart
      headingId="ark-allocation-title"
      title="펀드 평가금액 구성"
      subtitle={`${fundName} · 자료 기준일 ${reportDate}`}
      totalLabel={`순 평가금액 ${formatUsdAmount(
        parseScaledDecimal(allocation.totalValueUsd, USD_CENT_SCALE),
        USD_CENT_SCALE,
      )}`}
      view={view}
      footnotes={[
        "차트 비중은 평가금액에서 다시 계산한 값이고, 공식 비중은 목록·표에 적은 ARK 원문 값입니다. 공식 비중 합계는 반올림 때문에 정확히 100%가 아닐 수 있습니다.",
        "ARK 펀드의 공식 보유 자료이며 개인 계좌나 실시간 매매가 아닙니다.",
      ]}
    />
  );
}
