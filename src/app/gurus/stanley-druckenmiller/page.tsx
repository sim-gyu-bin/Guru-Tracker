import { cache, Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { GuruLink } from "@/components/guru-link";
import { HoldingAllocationChart } from "@/components/holding-allocation-chart";
import { StanleyRefresh } from "@/components/stanley-refresh";
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
import type { SecHolding } from "@/domain/sec";
import { getTickerReference, type TickerLookup } from "@/domain/ticker";
import { getStanleyView } from "@/server/stanley";
import { getHoldingTickers } from "@/server/tickers";
// 요청마다 저장된 공시와 동기화 상태를 읽으며 수집은 화면의 별도 보완 경로로 실행한다.
export const dynamic = "force-dynamic";

// 같은 요청의 Suspense 기본 화면과 티커 보강 화면은 동일한 BigInt 집계 결과를 공유한다.
const getHoldingAllocation = cache(buildHoldingAllocation);

const quantityFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
// 수집 시각은 한국 사용자 기준 KST로 표시한다. SEC의 보고일·제출일은 날짜 그대로 유지한다.
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

  return ticker ? (
    <span className="font-mono text-xs font-medium tabular-nums text-foreground">
      {ticker.ticker}
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">
      {loading && holding.shareType === "SH"
        ? "확인 중"
        : tickers.unavailableCusips.includes(holding.cusip)
          ? "일시 불가"
          : "—"}
    </span>
  );
}

/** SEC 13F 금액·수량은 BigInt로 표시해 소수점 반올림과 큰 정수 정밀도 손실을 막는다. */
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
    <Table className="min-w-[880px] text-xs">
      <TableHeader className="bg-card">
        <TableRow className="bg-card hover:bg-card">
          <TableHead
            scope="col"
            className="px-3 text-xs font-semibold text-foreground"
          >
            종목명
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-xs font-semibold text-foreground"
          >
            티커
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-xs font-semibold text-foreground"
          >
            종류
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-xs font-semibold text-foreground"
          >
            CUSIP
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-right text-xs font-semibold text-foreground"
          >
            평가금액 USD
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-right text-xs font-semibold text-foreground"
          >
            수량
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-xs font-semibold text-foreground"
          >
            단위
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-xs font-semibold text-foreground"
          >
            PUT / CALL
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((holding, index) => (
          <TableRow
            key={`${holding.cusip}-${holding.titleOfClass}-${holding.putCall ?? "common"}-${holding.issuer}-${holding.valueUsd}-${holding.shares}-${holding.shareType}-${index}`}
          >
            <TableCell className="px-3">{holding.issuer}</TableCell>
            <TableCell className="px-3">
              <TickerValue
                holding={holding}
                loading={tickerLoading}
                tickers={tickers}
              />
            </TableCell>
            <TableCell className="px-3">{holding.titleOfClass}</TableCell>
            <TableCell className="px-3 font-mono tabular-nums">
              {holding.cusip}
            </TableCell>
            <TableCell className="px-3 text-right font-mono tabular-nums">
              {quantityFormatter.format(BigInt(holding.valueUsd))}
            </TableCell>
            <TableCell className="px-3 text-right font-mono tabular-nums">
              {quantityFormatter.format(BigInt(holding.shares))}
            </TableCell>
            <TableCell className="px-3">{holding.shareType}</TableCell>
            <TableCell className="px-3">{holding.putCall ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** 모바일에서는 원문 단위·정수 정밀도를 유지한 카드 목록을 제공해 가로 스크롤 없이 읽게 한다. */
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
    <ul aria-label="보유 종목 카드" className="space-y-3 bg-card p-3 lg:hidden">
      {holdings.map((holding, index) => (
        <li
          key={`${holding.cusip}-${holding.titleOfClass}-${holding.putCall ?? "common"}-${holding.shareType}-${index}`}
          className="min-w-0 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold leading-5">
                {holding.issuer}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                티커{" "}
                <TickerValue
                  holding={holding}
                  loading={tickerLoading}
                  tickers={tickers}
                />
              </p>
            </div>
            {holding.putCall && (
              <Badge
                variant="outline"
                className="shrink-0 border-primary/25 bg-accent text-accent-foreground"
              >
                {holding.putCall}
              </Badge>
            )}
          </div>
          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
            {holding.titleOfClass}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">
                평가금액 USD
              </dt>
              <dd className="mt-1 break-all font-mono text-sm font-semibold tabular-nums">
                {quantityFormatter.format(BigInt(holding.valueUsd))}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">
                수량 · {holding.shareType}
              </dt>
              <dd className="mt-1 break-all font-mono text-sm font-semibold tabular-nums">
                {quantityFormatter.format(BigInt(holding.shares))}
              </dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-border pt-2 font-mono text-[11px] text-muted-foreground">
            CUSIP {holding.cusip}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * 공시 보유 목록과 금액 집계는 즉시 렌더링하고, OpenFIGI 현재 참조 티커만 별도로 보강한다.
 * 조회 실패는 SEC 공시 캐시를 실패로 바꾸지 않으며 unavailableCusips로만 표시한다.
 */
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">
              {filingLabel}
            </p>
            <h2
              id="holdings-heading"
              className="mb-0 text-base font-semibold tracking-[-0.02em]"
            >
              보유 종목
            </h2>
          </div>
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
        <div className="px-4 pb-3 text-xs leading-5 text-muted-foreground">
          <p>
            티커는 OpenFIGI의 현재 미국 시장 참조 정보이며 SEC 공시 기준일의
            티커가 아닙니다. PUT/CALL은 기초자산 티커를 표시합니다.
          </p>
          {tickerLoading ? (
            <p>티커 참조 정보를 확인 중입니다.</p>
          ) : (
            <>
              {tickers.unavailableCusips.length > 0 && (
                <p>
                  일부 티커 참조 정보는 일시적으로 조회할 수 없습니다. 공시
                  데이터는 정상 표시됩니다.
                </p>
              )}
              <p>티커 —은 현재 참조 티커가 매핑되지 않았음을 뜻합니다.</p>
            </>
          )}
        </div>
      </section>
    </>
  );
}

/** 티커 보강은 Suspense 경계 안에서만 기다려 기존 SEC 공시 캐시 표시를 지연시키지 않는다. */
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
        holdings={holdings}
        reportDate={reportDate}
        filingLabel={filingLabel}
        tickerLoading={false}
        tickers={tickers}
      />
    );
  } catch {
    return (
      <HoldingsContent
        holdings={holdings}
        reportDate={reportDate}
        tickerLoading={false}
        filingLabel={filingLabel}
        tickers={{
          ...EMPTY_TICKERS,
          unavailableCusips: holdings.map((holding) => holding.cusip),
        }}
      />
    );
  }
}

/**
 * Stanley Druckenmiller의 검증된 SEC 13F 스냅샷을 공시 정보·차트·반응형 보유 목록으로 보여 준다.
 * 공시 기준일과 제출일은 수집 성공 시각과 별도이며, 기존 캐시가 있으면 갱신 실패에도 보존한다.
 */
export default async function StanleyDruckenmillerPage() {
  const stanley = await getStanleyView();
  const snapshot = stanley.snapshot;

  return (
    <AppShell current="stanley">
      <nav
        aria-label="이동 경로"
        className="mb-[18px] flex gap-2 text-xs text-muted-foreground"
      >
        <GuruLink
          className="min-h-11 content-center hover:text-foreground"
          href="/"
        >
          추적 현황
        </GuruLink>
        <span aria-hidden="true" className="min-h-11 content-center">
          /
        </span>
        <span className="min-h-11 content-center text-foreground">
          Stanley Druckenmiller
        </span>
      </nav>
      <div className="mb-[22px] flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">
            SEC 13F · 저장된 공시
          </p>
          <h1 className="mb-2 text-[25px] leading-8 font-semibold tracking-[-0.035em] text-foreground">
            Stanley Druckenmiller
          </h1>
          <p className="mb-0 leading-[21px] text-muted-foreground">
            실시간 포지션이 아닌 SEC에 제출된 기관 보유 현황입니다.
          </p>
        </div>
        <Badge
          className={
            stanley.status === "ready"
              ? "border-success/30 bg-success/10 text-success"
              : stanley.status === "error"
                ? "border-destructive/25 bg-destructive/10 text-destructive"
                : stanley.status === "unconfigured"
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-border bg-card text-muted-foreground"
          }
          variant="outline"
        >
          {stanley.status === "ready"
            ? "캐시 준비됨"
            : stanley.status === "unconfigured"
              ? "설정 필요"
              : stanley.status === "error"
                ? "조회 오류"
                : "데이터 없음"}
        </Badge>
      </div>

      <StanleyRefresh
        lastAttemptAt={stanley.lastAttemptAt}
        lastError={stanley.lastError}
        stale={stanley.stale}
        status={stanley.status}
        syncing={stanley.syncing}
      />

      {snapshot ? (
        <>
          <section
            aria-label="공시 정보"
            className="mb-5 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card min-[761px]:grid-cols-4"
          >
            <div className="grid min-w-0 gap-1.5 border-r border-b border-border p-4 min-[761px]:border-b-0">
              <span className="text-[11px] text-muted-foreground">
                신고기관
              </span>
              <strong className="break-words text-xs font-semibold">
                {snapshot.managerName}
              </strong>
            </div>
            <div className="grid min-w-0 gap-1.5 border-b border-border p-4 min-[761px]:border-r min-[761px]:border-b-0">
              <span className="text-[11px] text-muted-foreground">기준일</span>
              <strong className="font-mono text-xs font-semibold tabular-nums">
                {snapshot.reportDate}
              </strong>
            </div>
            <div className="grid min-w-0 gap-1.5 border-r border-border p-4">
              <span className="text-[11px] text-muted-foreground">제출일</span>
              <strong className="font-mono text-xs font-semibold tabular-nums">
                {snapshot.filingDate}
              </strong>
            </div>
            <div className="grid min-w-0 gap-1.5 p-4">
              <span className="text-[11px] text-muted-foreground">
                수집 성공 시각
              </span>
              <strong className="font-mono text-xs font-semibold tabular-nums">
                {stanley.lastSuccessAt
                  ? `${collectedAtFormatter.format(new Date(stanley.lastSuccessAt))} KST`
                  : "기록 없음"}
              </strong>
            </div>
          </section>

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
          className="rounded-lg border border-dashed border-border bg-card px-5 py-7"
          aria-label="공시 캐시 없음"
        >
          <strong className="text-sm font-semibold">
            {stanley.status === "error"
              ? "캐시 조회에 실패했습니다"
              : "표시할 SEC 13F 캐시가 없습니다"}
          </strong>
          <p className="mt-1.5 mb-0 max-w-xl text-[13px] leading-5 text-muted-foreground">
            {stanley.status === "error"
              ? (stanley.lastError ??
                "기존 캐시를 읽지 못했습니다. 다시 시도해 주세요.")
              : "동기화가 완료되면 검증된 보유 종목이 표시됩니다."}
          </p>
        </section>
      )}

      <section
        aria-label="SEC 13F 시차 안내"
        className="mt-7 border-t border-border pt-4"
      >
        <strong className="text-xs font-semibold">13F 시차 주의</strong>
        <p className="mt-1 mb-0 max-w-3xl text-[13px] leading-5 text-muted-foreground">
          13F는 분기 종료 후 제출되는 공시입니다. 기준일 이후의 매매, 현재 보유
          여부 또는 수익률을 이 데이터만으로 단정할 수 없습니다. 수량 단위 SH는
          주식 수, PRN은 원금액이며 PUT·CALL은 옵션 구분입니다.
        </p>
      </section>
    </AppShell>
  );
}
