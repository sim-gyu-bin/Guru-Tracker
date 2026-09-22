import { cache, Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { BurryRefresh } from "@/components/burry-refresh";
import { GuruDetailHeader } from "@/components/guru-detail-header";
import { GuruLink } from "@/components/guru-link";
import { HoldingAllocationChart } from "@/components/holding-allocation-chart";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isAdminRow } from "@/domain/access";
import { buildHoldingAllocation } from "@/domain/holding-allocation";
import type { SecHolding } from "@/domain/sec";
import { getTickerReference, type TickerLookup } from "@/domain/ticker";
import { requireApprovedPage } from "@/server/access";
import { getSecView } from "@/server/sec-state";
import { getHoldingTickers } from "@/server/tickers";
// 요청마다 저장된 공시와 동기화 상태를 읽으며 수집은 화면의 별도 보완 경로로 실행한다.
export const dynamic = "force-dynamic";

// Suspense 기본 화면과 티커 보강 화면에서 동일한 BigInt 공시 금액 집계를 공유한다.
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

/** 원문 putCall 값으로 옵션을 구분한다. 비옵션 행은 주식·우선주·PRN 등을 원문 그대로 보존한다. */
type PositionType = "stock" | "put" | "call";

/**
 * 유형 표기를 한곳에서 정의해 표·카드가 같은 문구를 쓴다.
 * PUT과 CALL은 같은 계열 색을 써서 색이 매수·매도 방향을 암시하지 않게 한다.
 */
const POSITION_TYPE_META: Record<
  PositionType,
  { label: string; badgeClass: string }
> = {
  stock: {
    label: "주식 등",
    badgeClass: "border-border bg-muted/40 text-muted-foreground",
  },
  put: {
    label: "PUT",
    badgeClass: "border-primary/25 bg-accent text-accent-foreground",
  },
  call: {
    label: "CALL",
    badgeClass: "border-primary/25 bg-accent text-accent-foreground",
  },
};

/** 검증된 putCall 값으로 구분한다. 옵션이 없는 행에는 우선주·PRN 등도 포함될 수 있다. */
function positionTypeOf(holding: SecHolding): PositionType {
  if (holding.putCall === "PUT") return "put";
  if (holding.putCall === "CALL") return "call";
  return "stock";
}

/** 포지션 유형 배지다. 표·카드가 같은 클래스·문구를 쓰도록 컴포넌트로 고정한다. */
function PositionTypeBadge({ type }: { type: PositionType }) {
  const meta = POSITION_TYPE_META[type];

  return (
    <Badge
      className={`h-auto shrink-0 rounded-full px-2 py-[3px] text-xs font-semibold ${meta.badgeClass}`}
      variant="outline"
    >
      {meta.label}
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

  return ticker ? (
    <span className="font-sans text-sm font-medium tabular-nums text-foreground">
      {ticker.ticker}
    </span>
  ) : (
    <span className="text-sm text-muted-foreground">
      {loading && holding.shareType === "SH"
        ? "확인 중"
        : tickers.unavailableCusips.includes(holding.cusip)
          ? "일시 불가"
          : "—"}
    </span>
  );
}

/** 13F 금액·수량은 BigInt로 표시해 소수점 반올림과 큰 정수 정밀도 손실을 막는다. */
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
          <TableHead
            scope="col"
            className="px-3 text-sm font-semibold text-foreground"
          >
            종목명
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-sm font-semibold text-foreground"
          >
            티커
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-sm font-semibold text-foreground"
          >
            유형
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-sm font-semibold text-foreground"
          >
            종류
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-sm font-semibold text-foreground"
          >
            CUSIP
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-right text-sm font-semibold text-foreground"
          >
            공시 금액 USD
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-right text-sm font-semibold text-foreground"
          >
            수량
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-sm font-semibold text-foreground"
          >
            단위
          </TableHead>
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
              <PositionTypeBadge type={positionTypeOf(holding)} />
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
    <ul
      aria-label="보유 종목 카드"
      className="space-y-3 bg-card p-3.5 lg:hidden"
    >
      {holdings.map((holding, index) => (
        <li
          key={`${holding.cusip}-${holding.titleOfClass}-${holding.putCall ?? "common"}-${holding.shareType}-${index}`}
          className="min-w-0 rounded-lg border border-border bg-card p-4"
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
            <PositionTypeBadge type={positionTypeOf(holding)} />
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

/**
 * 공시 보유 목록과 금액 구성 차트는 즉시 렌더링하고, OpenFIGI 현재 참조 티커만 별도로 보강한다.
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
        presentation={{
          name: "마이클 버리",
          portrait: { src: "/michael-burry.png" },
        }}
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
              id="holdings-heading"
              className="mb-0 text-xl leading-7 font-semibold tracking-tight"
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
 * Michael Burry의 검증된 SEC 13F 스냅샷을 Stanley와 동일한 공시 메타·금액 구성 차트·반응형 목록으로 보여 준다.
 * 주식과 옵션(PUT·CALL)을 유형 배지로 구분하고, 옵션 금액이 프리미엄·투자 원금·손익이 아님을 표와 안내에서 밝힌다.
 * 금액·수량은 원문 USD 정수 정밀도(BigInt)를 유지하며, 기존 캐시가 있으면 갱신 실패에도 보존한다.
 */
export default async function MichaelBurryPage() {
  // 공시 자료를 읽기 전에 승인 상태를 서버에서 다시 확인한다. 승인되지 않은 요청은 여기서 끝난다.
  const row = await requireApprovedPage();
  // Stanley와 같은 공유 판독기를 쓰고 수집 대상만 Burry다.
  const burry = await getSecView("burry");
  const snapshot = burry.snapshot;

  return (
    <AppShell admin={isAdminRow(row)} current="burry">
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
          Michael Burry
        </span>
      </nav>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <GuruDetailHeader
            introduction="금융위기를 예견한 역발상 투자자이자 사이언 창업자"
            name="Michael Burry"
            source="SEC EDGAR 13F · 저장된 공식 공시"
          />
          <p className="mt-1.5 mb-0 max-w-[680px] text-sm leading-5 text-muted-foreground">
            {snapshot
              ? `실시간 포지션이 아닌 SEC에 제출된 ${snapshot.managerName}의 기관 보유 현황입니다.`
              : "실시간 포지션이 아닌 SEC에 제출된 기관 보유 현황입니다."}
          </p>
        </div>
        {/* 캐시 준비됨만 네온 초록으로 강조하고, 오류·설정 필요·빈 상태는 의미 색을 유지한다. */}
        <Badge
          className={
            burry.status === "ready"
              ? "border-primary/25 bg-primary/5 text-[color:color-mix(in_oklab,var(--primary)_82%,var(--foreground))] dark:border-primary/40 dark:bg-primary/10 dark:text-primary dark:shadow-primary-glow-soft"
              : burry.status === "error"
                ? "border-destructive/25 bg-destructive/10 text-destructive"
                : burry.status === "unconfigured"
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-border bg-card text-muted-foreground"
          }
          variant="outline"
        >
          {burry.status === "ready"
            ? "캐시 준비됨"
            : burry.status === "unconfigured"
              ? "설정 필요"
              : burry.status === "error"
                ? "조회 오류"
                : "데이터 없음"}
        </Badge>
      </div>

      <BurryRefresh
        lastAttemptAt={burry.lastAttemptAt}
        lastError={burry.lastError}
        stale={burry.stale}
        status={burry.status}
        syncing={burry.syncing}
      />

      {snapshot ? (
        <>
          <section
            aria-label="공시 정보"
            className="mb-5 overflow-hidden rounded-lg border border-border bg-card"
          >
            {/* 기준일·제출일은 13F 해석의 기준점이므로 목록보다 먼저 큰 값으로 읽히게 한다. */}
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
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2.5 border-t border-border px-4 py-3.5">
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
                    {burry.lastSuccessAt
                      ? `${collectedAtFormatter.format(new Date(burry.lastSuccessAt))} KST`
                      : "기록 없음"}
                  </dd>
                </div>
              </dl>
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
          className="rounded-lg border border-dashed border-border bg-card px-5 py-8"
          aria-label="공시 캐시 없음"
        >
          <strong className="text-lg font-semibold">
            {burry.status === "error"
              ? "캐시 조회에 실패했습니다"
              : "표시할 SEC 13F 캐시가 없습니다"}
          </strong>
          <p className="mt-2 mb-0 max-w-xl text-sm leading-6 text-muted-foreground">
            {burry.status === "error"
              ? (burry.lastError ??
                "기존 캐시를 읽지 못했습니다. 다시 시도해 주세요.")
              : "동기화가 완료되면 검증된 보유 종목과 옵션이 표시됩니다. 캐시가 없다는 사실은 현재 보유가 없다는 뜻이 아닙니다."}
          </p>
        </section>
      )}

      <section
        aria-label="SEC 13F 시차와 옵션 해석 안내"
        className="mt-9 border-t border-border pt-5"
      >
        <strong className="text-sm font-semibold">13F 시차 주의</strong>
        <p className="mt-1.5 mb-0 max-w-3xl text-sm leading-6 text-muted-foreground">
          13F는 분기 종료 후 제출되는 공시입니다. 기준일 이후의 매매, 현재 보유
          여부 또는 수익률을 이 데이터만으로 단정할 수 없습니다. 수량 단위 SH는
          주식 수, PRN은 원금액이며 PUT·CALL은 옵션 구분입니다.
        </p>
        <strong className="mt-4 block text-sm font-semibold">
          옵션(PUT·CALL) 해석 주의
        </strong>
        <p className="mt-1.5 mb-0 max-w-3xl text-sm leading-6 text-muted-foreground">
          옵션 행은 원문이 기재한 보유 옵션이며, 금액은 계약 프리미엄이나 투자
          원금이 아니라 기초자산 공시금액입니다. 행사가·만기·프리미엄·계약 수와
          옵션 손익은 이 공시에 없으므로 추정하지 않습니다. 차트의 비율은 공시
          금액 구성일 뿐 실제 투자 원금이나 전체 자산 배분 비중이 아닙니다.
        </p>
      </section>
    </AppShell>
  );
}
