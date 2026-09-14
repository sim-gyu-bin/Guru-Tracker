import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { HoldingAllocationChart } from "@/components/holding-allocation-chart";
import { StanleyRefresh } from "@/components/stanley-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getStanleyView } from "@/server/stanley";

// 요청마다 저장된 공시와 동기화 상태를 읽으며 수집은 화면의 별도 보완 경로로 실행한다.
export const dynamic = "force-dynamic";

const quantityFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
// 수집 시각은 한국 사용자 기준 KST로 표시한다. SEC의 보고일·제출일은 날짜 그대로 유지한다.
const collectedAtFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

/** SEC 13F 금액·수량은 BigInt로 표시해 소수점 반올림과 큰 정수 정밀도 손실을 막는다. */
function HoldingTable({ holdings }: { holdings: SecHolding[] }) {
  return (
    <Table className="min-w-[800px] text-xs">
      <TableHeader className="bg-muted/60">
        <TableRow className="hover:bg-muted/60">
          <TableHead
            scope="col"
            className="px-3 text-[11px] text-muted-foreground"
          >
            종목명
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-[11px] text-muted-foreground"
          >
            종류
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-[11px] text-muted-foreground"
          >
            CUSIP
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-right text-[11px] text-muted-foreground"
          >
            평가금액 USD
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-right text-[11px] text-muted-foreground"
          >
            수량
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-[11px] text-muted-foreground"
          >
            단위
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-[11px] text-muted-foreground"
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

/**
 * Stanley Druckenmiller의 검증된 SEC 13F 스냅샷과 원문 경로를 보여 준다.
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
        <Link
          className="min-h-11 content-center hover:text-foreground"
          href="/"
        >
          추적 현황
        </Link>
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

          <HoldingAllocationChart
            allocation={buildHoldingAllocation(snapshot.holdings)}
            reportDate={snapshot.reportDate}
          />

          <section
            aria-labelledby="holdings-heading"
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">
                  {snapshot.form} · {snapshot.accession}
                </p>
                <h2
                  id="holdings-heading"
                  className="mb-0 text-base font-semibold tracking-[-0.02em]"
                >
                  보유 종목
                </h2>
              </div>
              <div className="flex gap-2">
                <Button
                  asChild
                  className="min-h-11"
                  size="sm"
                  variant="outline"
                >
                  <a href={snapshot.sourceUrl} rel="noreferrer" target="_blank">
                    SEC 원문
                  </a>
                </Button>
                <Button
                  asChild
                  className="min-h-11"
                  size="sm"
                  variant="outline"
                >
                  <a
                    href={snapshot.informationTableUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    정보표
                  </a>
                </Button>
              </div>
            </div>
            <HoldingTable holdings={snapshot.holdings} />
          </section>
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
              : "동기화가 완료되면 검증된 원문 링크와 보유 종목이 표시됩니다."}
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
