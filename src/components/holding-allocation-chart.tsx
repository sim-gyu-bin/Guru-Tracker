"use client";

import { useState } from "react";
import { Pie, PieChart } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type {
  HoldingAllocation,
  HoldingAllocationItem,
} from "@/domain/holding-allocation";

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

const chartConfig = {
  value: {
    label: "평가금액 비중",
  },
} satisfies ChartConfig;

/** USD 정수 문자열을 정밀도 손실 없이 통화 표기로 나눈다. */
function formatUsd(valueUsd: string): string {
  return USD_FORMATTER.format(BigInt(valueUsd));
}

/** 양수인 작은 비중을 0%로 잘못 읽히지 않도록 표시한다. */
function formatPercent(percent: number): string {
  if (percent > 0 && percent < 0.01) {
    return "<0.01%";
  }

  return `${percent.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}%`;
}

function formatSecurityType(item: HoldingAllocationItem): string {
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
 * 서버에서 BigInt로 집계한 13F 평가금액 구성을 도넛과 접근 가능한 텍스트 목록으로 표시한다.
 * SEC 공시 기준일의 USD 평가금액만 다루며, 총액 0 또는 빈 공시는 차트 대신 안내를 표시한다.
 */
export function HoldingAllocationChart({
  allocation,
  reportDate,
}: {
  allocation: HoldingAllocation;
  reportDate: string;
}) {
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [tooltipTrigger, setTooltipTrigger] = useState<"hover" | "click">(
    "hover",
  );
  const chartData = allocation.items.map((item, index) => ({
    ...item,
    fill: item.isOther ? "var(--chart-6)" : CHART_COLORS[index],
  }));
  const topLabel = `상위 ${allocation.itemCount}개`;

  return (
    <section
      aria-labelledby="holding-allocation-title"
      className="mb-5 rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2
            id="holding-allocation-title"
            className="text-base font-semibold tracking-tight text-foreground"
          >
            13F 공시 평가금액 구성
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            기준일 {reportDate}
          </p>
        </div>
        <p className="max-w-full break-all font-mono text-sm tabular-nums text-muted-foreground">
          합계 {formatUsd(allocation.totalValueUsd)}
        </p>
      </div>

      {allocation.items.length === 0 ? (
        <div className="mt-6 flex min-h-60 items-center justify-center border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
          이 공시에는 평가금액이 있는 보유종목이 없습니다.
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-center">
          <ul className="order-2 min-w-0 divide-y divide-border">
            {chartData.map((item) => (
              <li
                key={item.key}
                className="flex gap-3 py-3 first:pt-3 last:pb-3"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.fill }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 break-words text-sm font-medium text-foreground">
                      {item.issuer}
                    </p>
                    <p className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground">
                      {formatPercent(item.percent)}
                    </p>
                  </div>
                  <p className="mt-0.5 break-words font-mono text-xs leading-5 text-muted-foreground">
                    {formatSecurityType(item)}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs tabular-nums text-muted-foreground">
                    {formatUsd(item.valueUsd)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="order-1 flex min-h-64 min-w-0 items-center justify-center">
            <ChartContainer
              config={chartConfig}
              initialDimension={{ width: 320, height: 320 }}
              className="aspect-square w-full max-w-72 [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-solid [&_.recharts-surface:focus-visible]:outline-ring"
              // 터치에는 hover가 없으므로 탭으로 선택하고, 마우스로 돌아오면 hover 탐색을 복원한다.
              onPointerDownCapture={(event) => {
                setTooltipTrigger(
                  event.pointerType === "touch" ? "click" : "hover",
                );
              }}
              onPointerMoveCapture={(event) => {
                if (
                  event.pointerType === "mouse" &&
                  tooltipTrigger !== "hover"
                ) {
                  setTooltipTrigger("hover");
                }
              }}
              onFocusCapture={() => setKeyboardFocused(true)}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setKeyboardFocused(false);
                }
              }}
            >
              <PieChart
                accessibilityLayer
                aria-label="평가금액 비중 차트. 좌우 방향키로 항목 이동"
              >
                <ChartTooltip
                  // Recharts의 item 툴팁은 최초 포인터 선택 전 계열을 찾지 못하므로 키보드 포커스 중에만 초기 항목을 제공한다.
                  defaultIndex={keyboardFocused ? 0 : undefined}
                  trigger={tooltipTrigger}
                  isAnimationActive={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(_, __, item) => {
                        const payload =
                          item.payload as (typeof chartData)[number];
                        return (
                          <div className="grid max-w-64 gap-1 whitespace-normal">
                            <span className="font-medium">
                              {payload.issuer}
                            </span>
                            <span className="text-muted-foreground">
                              {formatSecurityType(payload)}
                            </span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatUsd(payload.valueUsd)} ·{" "}
                              {formatPercent(payload.percent)}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Pie
                  data={chartData}
                  dataKey="percent"
                  nameKey="issuer"
                  // SVG 루트가 방향키 탐색을 제공하므로 내부 Pie의 중복 Tab 정지는 제거한다.
                  rootTabIndex={-1}
                  innerRadius="64%"
                  outerRadius="88%"
                  paddingAngle={0}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <text
                  x="50%"
                  y="43%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-xs"
                >
                  {topLabel}
                </text>
                <text
                  x="50%"
                  y="55%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground text-[26px] font-semibold tabular-nums"
                >
                  {formatPercent(allocation.topItemsPercent)}
                </text>
              </PieChart>
            </ChartContainer>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-1 text-xs leading-5 text-muted-foreground">
        <p>SEC 공시 금액 기준이며 현재 전체 자산 배분이 아닙니다.</p>
        <p>
          PUT/CALL 금액은 옵션 매입원금·프리미엄이나 손익을 뜻하지 않으며,
          주식·PUT·CALL을 구분해 집계합니다.
        </p>
      </div>
    </section>
  );
}
