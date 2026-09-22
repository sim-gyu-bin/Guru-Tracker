import { cache, Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { GuruLink } from "@/components/guru-link";
import { HoldingAllocationChart } from "@/components/holding-allocation-chart";
import { SecRefresh, type SecRefreshManager } from "@/components/sec-refresh";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildHoldingAllocation } from "@/domain/holding-allocation";
import type { SecHolding, SecSnapshot, SecView } from "@/domain/sec";
import { getTickerReference, type TickerLookup } from "@/domain/ticker";
import { formatUsdAmount } from "@/lib/decimal";
import { getHoldingTickers } from "@/server/tickers";

const getHoldingAllocation = cache(buildHoldingAllocation);
const quantityFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const collectedAtFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});
const EMPTY_TICKERS: TickerLookup = {
  byCusip: {},
  unresolvedCusips: [],
  unavailableCusips: [],
};

type SecManagerScreen = "stanley" | "laffont" | "gerstner" | "tepper";

/** 공통 상세가 쓰는 사람·운용사·경로 설정이다. 매니저 식별자는 동기화 URL과 서버 조회 대상을 항상 같게 유지한다. */
export type SecManagerDetailConfig = Readonly<{
  manager: SecRefreshManager;
  screen: SecManagerScreen;
  name: string;
  managerName: string;
}>;

type SecManagerDetailProps = Readonly<{
  config: SecManagerDetailConfig;
  view: SecView;
  admin: boolean;
}>;

function statusLabel(status: SecView["status"]) {
  if (status === "ready") return "캐시 준비됨";
  if (status === "unconfigured") return "설정 필요";
  if (status === "error") return "조회 오류";
  return "데이터 없음";
}

function statusClassName(status: SecView["status"]) {
  if (status === "ready") return "border-success/30 bg-success/10 text-success";
  if (status === "error")
    return "border-destructive/25 bg-destructive/10 text-destructive";
  if (status === "unconfigured")
    return "border-warning/30 bg-warning/10 text-warning";
  return "border-border bg-card text-muted-foreground";
}

/** 원문 putCall을 유형으로 드러내되 방향·손익이나 프리미엄을 뜻하는 색은 쓰지 않는다. */
function PositionTypeBadge({ holding }: { holding: SecHolding }) {
  const label = holding.putCall ?? "주식 등";
  return (
    <Badge
      className={
        holding.putCall
          ? "h-auto shrink-0 rounded-full border-primary/25 bg-accent px-2 py-[3px] text-xs font-semibold text-accent-foreground"
          : "h-auto shrink-0 rounded-full border-border bg-muted/40 px-2 py-[3px] text-xs font-semibold text-muted-foreground"
      }
      variant="outline"
    >
      {label}
    </Badge>
  );
}

/** SH(주식·ETF·ADR)와 그 옵션의 기초자산에만 확인된 현재 참조 티커를 표시한다. */
function TickerValue({
  holding,
  tickers,
  loading,
}: {
  holding: Pick<SecHolding, "cusip" | "shareType">;
  tickers: TickerLookup;
  loading: boolean;
}) {
  const ticker = getTickerReference(holding, tickers.byCusip);
  if (ticker)
    return (
      <span className="font-sans text-sm font-medium tabular-nums text-foreground">
        {ticker.ticker}
      </span>
    );

  return (
    <span className="text-sm text-muted-foreground">
      {loading && holding.shareType === "SH"
        ? "확인 중"
        : tickers.unavailableCusips.includes(holding.cusip)
          ? "일시 불가"
          : "—"}
    </span>
  );
}

function HoldingTable({
  holdings,
  tickers,
  tickerLoading,
}: {
  holdings: SecHolding[];
  tickers: TickerLookup;
  tickerLoading: boolean;
}) {
  return (
    <Table className="min-w-[960px] text-sm">
      <TableHeader className="bg-card">
        <TableRow className="bg-card hover:bg-card">
          {[
            "종목명",
            "티커",
            "유형",
            "종류",
            "CUSIP",
            "공시 금액 USD",
            "수량",
            "단위",
          ].map((label) => (
            <TableHead
              className={`px-3 text-sm font-semibold text-foreground ${label === "공시 금액 USD" || label === "수량" ? "text-right" : ""}`}
              key={label}
              scope="col"
            >
              {label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((holding, index) => (
          <TableRow
            key={`${holding.cusip}-${holding.titleOfClass}-${holding.putCall ?? "common"}-${holding.issuer}-${holding.valueUsd}-${holding.shares}-${holding.shareType}-${index}`}
          >
            <TableCell className="min-w-[200px] whitespace-normal break-words px-3 py-2.5">
              {holding.issuer}
            </TableCell>
            <TableCell className="px-3 py-2.5">
              <TickerValue
                holding={holding}
                loading={tickerLoading}
                tickers={tickers}
              />
            </TableCell>
            <TableCell className="px-3 py-2.5">
              <PositionTypeBadge holding={holding} />
            </TableCell>
            <TableCell className="whitespace-normal break-words px-3 py-2.5">
              {holding.titleOfClass}
            </TableCell>
            <TableCell className="px-3 py-2.5 font-sans tabular-nums">
              {holding.cusip}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right font-sans tabular-nums">
              {quantityFormatter.format(BigInt(holding.valueUsd))}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right font-sans tabular-nums">
              {quantityFormatter.format(BigInt(holding.shares))}
            </TableCell>
            <TableCell className="px-3 py-2.5">{holding.shareType}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HoldingCards({
  holdings,
  tickers,
  tickerLoading,
}: {
  holdings: SecHolding[];
  tickers: TickerLookup;
  tickerLoading: boolean;
}) {
  return (
    <ul
      aria-label="보유 종목 카드"
      className="space-y-3 bg-card p-3.5 lg:hidden"
    >
      {holdings.map((holding, index) => (
        <li
          className="min-w-0 rounded-lg border border-border bg-card p-4"
          key={`${holding.cusip}-${holding.titleOfClass}-${holding.putCall ?? "common"}-${holding.shareType}-${index}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-lg font-semibold leading-7">
                {holding.issuer}
              </h3>
              <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
                티커{" "}
                <TickerValue
                  holding={holding}
                  loading={tickerLoading}
                  tickers={tickers}
                />
              </p>
            </div>
            <PositionTypeBadge holding={holding} />
          </div>
          <p className="mt-2.5 break-words text-base leading-6 text-muted-foreground">
            {holding.titleOfClass}
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-sm text-muted-foreground">공시 금액 USD</dt>
              <dd className="mt-1 font-sans text-base font-semibold tabular-nums [overflow-wrap:anywhere]">
                {quantityFormatter.format(BigInt(holding.valueUsd))}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-muted-foreground">
                수량 · {holding.shareType}
              </dt>
              <dd className="mt-1 font-sans text-base font-semibold tabular-nums [overflow-wrap:anywhere]">
                {quantityFormatter.format(BigInt(holding.shares))}
              </dd>
            </div>
          </dl>
          <p className="mt-3.5 border-t border-border pt-3.5 font-sans text-sm text-muted-foreground [overflow-wrap:anywhere]">
            CUSIP {holding.cusip}
          </p>
        </li>
      ))}
    </ul>
  );
}

function HoldingsContent({
  holdings,
  reportDate,
  filingLabel,
  tickers,
  tickerLoading,
}: {
  holdings: SecHolding[];
  reportDate: string;
  filingLabel: string;
  tickers: TickerLookup;
  tickerLoading: boolean;
}) {
  return (
    <>
      <HoldingAllocationChart
        allocation={getHoldingAllocation(holdings)}
        reportDate={reportDate}
        tickers={tickers.byCusip}
      />
      <section
        aria-labelledby="holdings-heading"
        className="overflow-hidden rounded-lg border border-border bg-card"
      >
        <div className="flex flex-wrap items-end justify-between gap-3.5 border-b border-border px-4 py-3.5">
          <div className="min-w-0">
            <p className="mb-2 text-sm font-medium tracking-[0.01em] text-muted-foreground">
              {filingLabel}
            </p>
            <h2
              className="mb-0 text-xl leading-7 font-semibold tracking-tight"
              id="holdings-heading"
            >
              보유 종목
            </h2>
          </div>
          <p className="mb-0 text-sm text-muted-foreground">
            보유 항목 {holdings.length}건
          </p>
        </div>
        <HoldingCards
          holdings={holdings}
          tickerLoading={tickerLoading}
          tickers={tickers}
        />
        <div className="hidden lg:block">
          <HoldingTable
            holdings={holdings}
            tickerLoading={tickerLoading}
            tickers={tickers}
          />
        </div>
        <div className="space-y-1.5 px-4 pt-2.5 pb-4 text-sm leading-6 text-muted-foreground">
          <p>
            티커는 OpenFIGI의 현재 미국 시장 참조 정보이며 SEC 공시 기준일의
            티커가 아닙니다. PUT·CALL 행은 기초자산 티커를 표시합니다.
          </p>
          <p>
            수량 단위 SH는 주식 수, PRN은 원금액이며, 옵션 행의 수량은 계약 수가
            아니라 원문이 기재한 값입니다.
          </p>
          {tickerLoading ? (
            <p>티커 참조 정보를 확인 중입니다.</p>
          ) : (
            <>
              {tickers.unavailableCusips.length > 0 ? (
                <p>
                  일부 티커 참조 정보는 일시적으로 조회할 수 없습니다. 공시
                  데이터는 정상 표시됩니다.
                </p>
              ) : null}
              <p>티커 —은 현재 참조 티커가 매핑되지 않았음을 뜻합니다.</p>
            </>
          )}
        </div>
      </section>
    </>
  );
}

async function ResolvedHoldingsContent({
  holdings,
  reportDate,
  filingLabel,
}: {
  holdings: SecHolding[];
  reportDate: string;
  filingLabel: string;
}) {
  try {
    const tickers = await getHoldingTickers(holdings);
    return (
      <HoldingsContent
        filingLabel={filingLabel}
        holdings={holdings}
        reportDate={reportDate}
        tickerLoading={false}
        tickers={tickers}
      />
    );
  } catch {
    return (
      <HoldingsContent
        filingLabel={filingLabel}
        holdings={holdings}
        reportDate={reportDate}
        tickerLoading={false}
        tickers={{
          ...EMPTY_TICKERS,
          unavailableCusips: holdings.map((holding) => holding.cusip),
        }}
      />
    );
  }
}

function PreviousFiling({ snapshot }: { snapshot: SecSnapshot | null }) {
  if (!snapshot) return null;
  const allocation = getHoldingAllocation(snapshot.holdings);
  return (
    <section
      aria-labelledby="previous-filing-heading"
      className="mt-5 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-lg font-semibold" id="previous-filing-heading">
        이전 공시 비교
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        현재 공시와 이전에 검증·저장한 공시의 기준일·항목 수·공시 금액 합계를
        함께 확인합니다. 매매·손익·현재 보유 변화를 추정하지 않습니다.
      </p>
      <dl className="mt-4 grid gap-3 min-[481px]:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">이전 기준일</dt>
          <dd className="mt-1 font-sans font-semibold tabular-nums">
            {snapshot.reportDate}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">보유 항목</dt>
          <dd className="mt-1 font-sans font-semibold tabular-nums">
            {snapshot.holdings.length}건
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">공시 금액 합계</dt>
          <dd className="mt-1 font-sans font-semibold tabular-nums">
            {formatUsdAmount(BigInt(allocation.totalValueUsd), 0)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * Stanley 및 일반 SEC 13F 관리자의 공통 상세 화면이다.
 * 캐시 상태·공시 기준일·제출일·원문 링크·이전 스냅샷·차트·반응형 보유표를 같은 순서로 표시한다. PUT/CALL은 원문 유형만 표시하며 손익을 추정하지 않는다.
 */
export function SecManagerDetail({
  config,
  view,
  admin,
}: SecManagerDetailProps) {
  const snapshot = view.snapshot;
  return (
    <AppShell admin={admin} current={config.screen}>
      <nav
        aria-label="이동 경로"
        className="mb-5 flex gap-2.5 text-sm leading-5 text-muted-foreground"
      >
        <GuruLink
          className="min-h-11 content-center hover:text-foreground"
          href="/main"
        >
          추적 현황
        </GuruLink>
        <span aria-hidden="true" className="min-h-11 content-center">
          /
        </span>
        <span className="min-h-11 content-center text-foreground">
          {config.name}
        </span>
      </nav>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-sm font-semibold tracking-[0.01em] text-muted-foreground">
            SEC EDGAR 13F · 저장된 공식 공시
          </p>
          <h1 className="mb-2.5 text-3xl leading-9 font-semibold tracking-tight text-foreground">
            {config.name}
          </h1>
          <p className="mb-0 max-w-[680px] text-lg leading-7 text-muted-foreground">
            {snapshot
              ? `실시간 포지션이 아닌 SEC에 제출된 ${snapshot.managerName}의 기관 보유 현황입니다.`
              : `실시간 포지션이 아닌 SEC에 제출된 ${config.managerName}의 기관 보유 현황입니다.`}
          </p>
        </div>
        <Badge className={statusClassName(view.status)} variant="outline">
          {statusLabel(view.status)}
        </Badge>
      </div>
      <SecRefresh
        lastAttemptAt={view.lastAttemptAt}
        lastError={view.lastError}
        manager={config.manager}
        name={config.name}
        stale={view.stale}
        status={view.status}
        syncing={view.syncing}
      />
      {snapshot ? (
        <>
          <section
            aria-label="공시 정보"
            className="mb-5 overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="grid grid-cols-1 min-[481px]:grid-cols-2">
              <div className="grid min-w-0 gap-1.5 border-b border-border p-4 min-[481px]:border-r min-[481px]:border-b-0">
                <span className="text-sm font-medium text-muted-foreground">
                  공시 기준일
                </span>
                <strong className="font-sans text-lg font-semibold tabular-nums">
                  {snapshot.reportDate}
                </strong>
                <span className="text-sm leading-5 text-muted-foreground">
                  분기 말 보유 현황 기준이며 제출일과 다릅니다.
                </span>
              </div>
              <div className="grid min-w-0 gap-1.5 p-4">
                <span className="text-sm font-medium text-muted-foreground">
                  SEC 제출일
                </span>
                <strong className="font-sans text-lg font-semibold tabular-nums">
                  {snapshot.filingDate}
                </strong>
                <span className="text-sm leading-5 text-muted-foreground">
                  {snapshot.form} · CIK {snapshot.cik}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-border px-4 py-3.5">
              <dl className="flex min-w-0 flex-col gap-1.5 text-sm leading-5">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <dt className="text-muted-foreground">신고기관</dt>
                  <dd className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">
                    {snapshot.managerName}
                  </dd>
                </div>
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <dt className="text-muted-foreground">접수번호</dt>
                  <dd className="min-w-0 font-sans tabular-nums [overflow-wrap:anywhere]">
                    {snapshot.accession}
                  </dd>
                </div>
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <dt className="text-muted-foreground">수집 성공 시각</dt>
                  <dd className="min-w-0 font-sans tabular-nums [overflow-wrap:anywhere]">
                    {view.lastSuccessAt
                      ? `${collectedAtFormatter.format(new Date(view.lastSuccessAt))} KST`
                      : "기록 없음"}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
          <PreviousFiling snapshot={view.previousSnapshot} />
          <Suspense
            fallback={
              <HoldingsContent
                filingLabel={`${snapshot.form} · ${snapshot.accession}`}
                holdings={snapshot.holdings}
                reportDate={snapshot.reportDate}
                tickerLoading
                tickers={EMPTY_TICKERS}
              />
            }
          >
            <ResolvedHoldingsContent
              filingLabel={`${snapshot.form} · ${snapshot.accession}`}
              holdings={snapshot.holdings}
              reportDate={snapshot.reportDate}
            />
          </Suspense>
        </>
      ) : (
        <section
          aria-label="공시 캐시 없음"
          className="rounded-lg border border-dashed border-border bg-card px-5 py-8"
        >
          <strong className="text-lg font-semibold">
            {view.status === "error"
              ? "캐시 조회에 실패했습니다"
              : "표시할 SEC 13F 캐시가 없습니다"}
          </strong>
          <p className="mt-2 mb-0 max-w-xl text-sm leading-6 text-muted-foreground">
            {view.status === "error"
              ? (view.lastError ??
                "기존 캐시를 읽지 못했습니다. 다시 시도해 주세요.")
              : "동기화가 완료되면 검증된 보유 종목이 표시됩니다. 캐시가 없다는 사실은 현재 보유가 없다는 뜻이 아닙니다."}
          </p>
        </section>
      )}
      <section
        aria-label="SEC 13F 시차 안내"
        className="mt-9 border-t border-border pt-5"
      >
        <strong className="text-sm font-semibold">13F 시차 주의</strong>
        <p className="mt-1.5 mb-0 max-w-3xl text-sm leading-6 text-muted-foreground">
          13F는 분기 종료 후 제출되는 공시입니다. 기준일 이후의 매매, 현재 보유
          여부 또는 수익률을 이 데이터만으로 단정할 수 없습니다. 수량 단위 SH는
          주식 수, PRN은 원금액이며 PUT·CALL은 옵션 구분입니다. 옵션 공시 금액은
          프리미엄·투자 원금·손익을 뜻하지 않습니다.
        </p>
      </section>
    </AppShell>
  );
}
