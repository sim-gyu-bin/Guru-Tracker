"use client";

import { useState } from "react";
import { Pie, PieChart } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { AllocationChartView } from "@/domain/portfolio-allocation";
import { formatPercent } from "@/lib/decimal";

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

/**
 * 저장된 평가금액 구성을 도넛과 접근 가능한 텍스트 목록으로 표시하는 공통 표현 컴포넌트다.
 * 금액 포맷·비중 계산·출처별 문구는 SEC/ARK 어댑터가 끝내고 전달하며, 이 컴포넌트는 표시만 담당한다.
 * unavailableMessage가 있으면 목록·도넛까지 차트 영역 전체를 안내로 대체하고, 조각이 없으면 emptyMessage를 보여 준다.
 */
export function AllocationChart({
  headingId,
  title,
  subtitle,
  totalLabel,
  view,
  footnotes,
}: {
  headingId: string;
  title: string;
  subtitle: string;
  totalLabel: string;
  view: AllocationChartView;
  footnotes: string[];
}) {
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [tooltipTrigger, setTooltipTrigger] = useState<"hover" | "click">(
    "hover",
  );
  const chartData = view.slices.map((slice, index) => ({
    ...slice,
    fill: slice.isOther ? "var(--chart-6)" : CHART_COLORS[index],
  }));

  return (
    <section
      aria-labelledby={headingId}
      className="mb-5 rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="text-base font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <p className="max-w-full break-all font-mono text-sm tabular-nums text-muted-foreground">
          {totalLabel}
        </p>
      </div>

      {view.unavailableMessage ? (
        <div className="mt-5 flex min-h-60 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 text-center text-sm leading-6 text-muted-foreground">
          {view.unavailableMessage}
        </div>
      ) : view.slices.length === 0 ? (
        <div className="mt-6 flex min-h-60 items-center justify-center border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
          {view.emptyMessage}
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-center">
          <ul className="order-2 min-w-0 divide-y divide-border">
            {chartData.map((slice) => (
              <li
                key={slice.key}
                className="flex gap-3 py-3 first:pt-3 last:pb-3"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.fill }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 break-words text-sm font-medium text-foreground">
                      {slice.label}
                      {slice.ticker && (
                        <span className="ml-2 font-mono text-xs font-medium tabular-nums text-muted-foreground">
                          {slice.ticker}
                        </span>
                      )}
                    </p>
                    <p className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground">
                      {formatPercent(slice.percent)}
                    </p>
                  </div>
                  <p className="mt-0.5 break-words font-mono text-xs leading-5 text-muted-foreground">
                    {slice.detail}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs tabular-nums text-muted-foreground">
                    {slice.amountLabel}
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
                              {payload.label}
                              {payload.ticker && (
                                <span className="ml-2 font-mono text-xs font-medium tabular-nums text-muted-foreground">
                                  {payload.ticker}
                                </span>
                              )}
                            </span>
                            <span className="text-muted-foreground">
                              {payload.detail}
                            </span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {payload.amountLabel} ·{" "}
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
                  nameKey="label"
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
                  {view.topLabel}
                </text>
                <text
                  x="50%"
                  y="55%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground text-[26px] font-semibold tabular-nums"
                >
                  {formatPercent(view.topPercent)}
                </text>
              </PieChart>
            </ChartContainer>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-1 text-xs leading-5 text-muted-foreground">
        {footnotes.map((footnote) => (
          <p key={footnote}>{footnote}</p>
        ))}
      </div>
    </section>
  );
}
