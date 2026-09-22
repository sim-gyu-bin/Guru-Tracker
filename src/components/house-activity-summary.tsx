import type { HousePtrActivitySummary } from "@/domain/house-activity";

/**
 * 자산별 신고 활동 요약(서버 컴포넌트).
 *
 * 보여 주는 값은 공식 PTR 1건의 신고 건수뿐이다. 금액 합계·중간값·자산 비중·보유 수량·보유 현황을 계산하거나
 * 주장하지 않으며, 거래금액 범위 문자열은 집계에 전혀 쓰지 않는다.
 *
 * 집계 묶음 기준(표시 문구에는 넣지 않고 여기에 기록한다):
 * - 원문 자산명 문자열이 정확히 같고 자산유형 묶음이 같은 행만 한 항목으로 센다. 이름 정규화나 티커 기반 추측 매핑은 없다.
 * - 같은 원문 자산명의 주식(ST)·옵션(OP)은 기초자산이 같으므로 한 항목으로 합치고, 비상장 주식(PS)·자산담보부증권(AB) 등
 *   다른 코드는 같은 이름이어도 코드를 키에 넣어 분리한다. 따라서 같은 이름이 ST·OP 항목과 PS 항목으로 나뉘어 보일 수 있다.
 * - 자산유형 코드는 원문 코드를 그대로 병기한다(예: PS = 비상장 주식. 전체 코드표는 하우스 PTR 코드표와 README 참고).
 *
 * 막대는 항목 가운데 최다 신고 건수를 100%로 한 상대 길이이고 값이 아니라 장식이므로 `aria-hidden`으로 두며,
 * 화면 낭독에는 항상 건수 텍스트를 함께 둔다(퍼센트 수치·진행률 역할을 쓰지 않는다).
 * 항목을 상위 몇 개로 줄이지 않고 집계 결과 전체를 표시한다.
 */
export function HouseActivitySummary({
  summary,
}: {
  summary: HousePtrActivitySummary;
}) {
  return (
    <section
      aria-labelledby="house-activity-heading"
      className="mb-5 overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="border-b border-border px-4 py-3">
        <p className="mb-1 text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">
          원문 신고 행 수 기준
        </p>
        <h2
          id="house-activity-heading"
          className="mb-0 text-base font-semibold tracking-[-0.02em]"
        >
          자산별 활동 요약
        </h2>
      </div>

      {/* 좁은 화면은 지표 3칸을 위에, 막대 목록을 아래에 둔다. 넓은 화면에서는 지표를 좁은 왼쪽 열에 세로로 쌓아
          카드가 세로로 길어지지 않게 하고 막대 목록에 가로 폭을 준다. */}
      <div className="grid gap-4 p-4 min-[761px]:grid-cols-[14rem_minmax(0,1fr)] min-[761px]:gap-5">
        <dl className="mb-0 grid grid-cols-3 gap-3 min-[761px]:grid-cols-1 min-[761px]:gap-2.5">
          <div className="grid min-w-0 gap-0.5">
            <dt className="text-[11px] leading-4 text-muted-foreground">
              거래
            </dt>
            <dd className="mb-0 font-sans text-base font-semibold tabular-nums">
              {summary.transactionCount}건
            </dd>
          </div>
          <div className="grid min-w-0 gap-0.5">
            <dt className="text-[11px] leading-4 text-muted-foreground">
              원문 자산
            </dt>
            <dd className="mb-0 font-sans text-base font-semibold tabular-nums">
              {summary.items.length}개
            </dd>
          </div>
          <div className="grid min-w-0 gap-0.5">
            <dt className="text-[11px] leading-4 text-muted-foreground">
              옵션 거래
            </dt>
            <dd className="mb-0 font-sans text-base font-semibold tabular-nums">
              {summary.optionTransactionCount}건
            </dd>
          </div>
        </dl>

        <div className="min-w-0">
          {summary.items.length > 0 ? (
            <>
              <p className="mb-0 text-[11px] leading-4 text-muted-foreground">
                막대는 최다 {summary.maxTransactionCount}건 기준 상대 길이
              </p>
              <ul
                aria-label="자산별 신고 건수"
                className="mt-2.5 mb-0 space-y-3"
              >
                {summary.items.map((item) => (
                  <li className="grid gap-1.5" key={item.key}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      {/* 원문 티커 표기가 있으면 티커를 주표제로 두고, 없으면 원문 자산명을 주표제로 쓴다. */}
                      <span className="min-w-0 text-xs font-semibold [overflow-wrap:anywhere]">
                        {item.ticker ?? item.asset}
                      </span>
                      <span className="shrink-0 font-sans text-xs font-semibold tabular-nums">
                        {item.transactionCount}건
                      </span>
                    </div>
                    {/* 건수는 위 텍스트로 읽는다. 도넛의 초록 그라데이션 토큰을 공유하고 다크에서만 약하게 발광한다. */}
                    <span
                      aria-hidden="true"
                      className="block h-1.5 w-full rounded-full bg-muted"
                    >
                      <span
                        className="block h-full min-w-[2px] rounded-full bg-linear-to-r from-[var(--chart-1)] to-[var(--chart-1-highlight)] dark:shadow-[0_0_6px_color-mix(in_srgb,var(--chart-1)_28%,transparent)]"
                        style={{
                          width: `${(item.transactionCount / summary.maxTransactionCount) * 100}%`,
                        }}
                      />
                    </span>
                    {/* 티커를 주표제로 쓴 항목은 보조줄에 원문 자산명 전체를 남긴다. */}
                    <p className="mb-0 text-[11px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">
                      {item.ticker ? item.asset : null}
                      {item.ticker ? " · 자산유형 " : "자산유형 "}
                      {item.assetTypeCodes.join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2.5 mb-0 text-xs leading-5 text-muted-foreground">
              공식 원문 1건에 표시할 거래 건이 없습니다.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4 py-3 text-[11px] leading-4 text-muted-foreground">
        <p className="mb-0">
          동일 원문명의 주식·옵션은 함께 집계합니다. 옵션 거래는 전체 거래에
          포함됩니다.
        </p>
        <p className="mt-1 mb-0">
          최신 공시의 신고 건수이며 보유·금액 비중이 아닙니다.
        </p>
      </div>
    </section>
  );
}
