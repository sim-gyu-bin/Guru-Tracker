import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ArkAllocationChart } from "@/components/ark-allocation-chart";
import { ArkRefresh } from "@/components/ark-refresh";
import { GuruLink } from "@/components/guru-link";
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
import {
  ARK_FUNDS,
  type ArkFund,
  type ArkHolding,
  isArkFund,
} from "@/domain/ark";
import { buildArkAllocation } from "@/domain/ark-allocation";
import { formatDecimalString } from "@/lib/decimal";
import { requireApprovedPage } from "@/server/access";
import { getArkView } from "@/server/ark";

// 요청마다 저장된 펀드 자료와 동기화 상태를 읽으며 수집은 화면의 별도 보완 경로로 실행한다.
export const dynamic = "force-dynamic";

// 수집 시각은 한국 사용자 기준 KST로 표시한다. 자료 기준일은 ARK 원문 날짜를 그대로 유지한다.
const collectedAtFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

const DEFAULT_FUND: ArkFund = "ARKK";

/**
 * 펀드 전환 링크 목록이다.
 * 터치·키보드 조작을 위해 44px 높이를 유지하고, 현재 펀드는 aria-current로 구분한다.
 */
function FundSelector({ current }: { current: ArkFund }) {
  return (
    <nav
      aria-label="ARK 펀드 선택"
      className="mb-5 grid grid-cols-3 gap-2 min-[761px]:flex min-[761px]:flex-wrap"
    >
      {ARK_FUNDS.map((fund) => {
        const isCurrent = fund.ticker === current;

        return (
          <GuruLink
            key={fund.ticker}
            aria-current={isCurrent ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-md border px-3 py-1 text-[13px] no-underline ${
              isCurrent
                ? "border-border bg-accent font-semibold text-accent-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
            href={`/main/gurus/cathie-wood?fund=${fund.ticker}`}
          >
            <span className="font-sans tabular-nums">{fund.ticker}</span>
            <span className="ml-2 hidden text-xs min-[761px]:inline">
              {fund.name}
            </span>
          </GuruLink>
        );
      })}
    </nav>
  );
}

/** 모바일은 카드로 표시하고 360px 미만에서는 금액·수량을 한 열로 쌓아 센트가 다음 줄로 갈라지는 일을 줄인다. */
function HoldingCards({ holdings }: { holdings: ArkHolding[] }) {
  return (
    <ul aria-label="보유 항목 카드" className="space-y-3 bg-card p-3 lg:hidden">
      {holdings.map((holding) => (
        <li
          key={holding.id}
          className="min-w-0 rounded-lg border border-border bg-card p-4"
        >
          <h3 className="break-words text-sm font-semibold leading-5">
            {holding.company.trim() || "—"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            티커{" "}
            <span className="font-sans text-xs font-medium tabular-nums text-foreground">
              {holding.ticker ?? "—"}
            </span>
          </p>
          <p className="mt-1 break-words font-sans text-xs leading-5 text-muted-foreground">
            {holding.identifier.trim() || "—"}
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">
                평가금액 USD
              </dt>
              <dd className="mt-1 break-all font-sans text-sm font-semibold tabular-nums">
                {formatDecimalString(holding.valueUsd)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">수량</dt>
              <dd className="mt-1 break-all font-sans text-sm font-semibold tabular-nums">
                {formatDecimalString(holding.shares)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">공식 비중</dt>
              <dd className="mt-1 break-all font-sans text-sm font-semibold tabular-nums">
                {formatDecimalString(holding.weightPercent)}%
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

/**
 * ARK 원문 보유 항목 표다.
 * 열 의미는 ARK 자료 그대로이며(원문 식별자·수량·공식 비중), SEC 13F의 CUSIP·PUT/CALL·단위 열을 쓰지 않는다.
 */
function HoldingTable({ holdings }: { holdings: ArkHolding[] }) {
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
            원문 식별자
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
            className="px-3 text-right text-xs font-semibold text-foreground"
          >
            공식 비중
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((holding) => (
          <TableRow key={holding.id}>
            <TableCell className="px-3">
              {holding.company.trim() || "—"}
            </TableCell>
            <TableCell className="px-3 font-sans tabular-nums">
              {holding.ticker ?? "—"}
            </TableCell>
            <TableCell className="px-3 font-sans tabular-nums">
              {holding.identifier.trim() || "—"}
            </TableCell>
            <TableCell className="px-3 text-right font-sans tabular-nums">
              {formatDecimalString(holding.valueUsd)}
            </TableCell>
            <TableCell className="px-3 text-right font-sans tabular-nums">
              {formatDecimalString(holding.shares)}
            </TableCell>
            <TableCell className="px-3 text-right font-sans tabular-nums">
              {formatDecimalString(holding.weightPercent)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Cathie Wood 화면은 ARK 6개 액티브 ETF 중 선택한 한 펀드의 공식 보유 자료를 보여 준다.
 * 개인 계좌가 아닌 펀드 자료이므로 제출일·accession 같은 13F 서식 정보를 쓰지 않는다.
 * 허용되지 않은 펀드 코드는 다른 펀드를 대신 보여 주지 않고 404로 거부한다.
 */
export default async function CathieWoodPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 공시 자료를 읽기 전에 승인 상태를 서버에서 다시 확인한다. 승인되지 않은 요청은 여기서 끝난다.
  const row = await requireApprovedPage();
  const params = await searchParams;

  // 같은 파라미터가 여러 번 온 요청은 어느 펀드를 보여 줄지 결정할 수 없으므로 거부한다.
  if (Array.isArray(params.fund)) {
    notFound();
  }

  const fund = params.fund ?? DEFAULT_FUND;

  if (!isArkFund(fund)) {
    notFound();
  }

  const ark = await getArkView(fund);
  const snapshot = ark.snapshot;
  // 펀드 이름은 별도 목록을 두지 않고 계약(ARK_FUNDS)을 단일 출처로 쓴다.
  const fundName =
    ARK_FUNDS.find((entry) => entry.ticker === fund)?.name ?? fund;

  return (
    <AppShell admin={isAdminRow(row)} current="cathie">
      <nav
        aria-label="이동 경로"
        className="mb-[18px] flex gap-2 text-xs text-muted-foreground"
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
          Cathie Wood
        </span>
      </nav>

      <div className="mb-[22px] flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1.5 text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">
            ARK 공식 보유 자료 · 펀드
          </p>
          <h1 className="mb-2 text-3xl leading-9 font-semibold tracking-tight text-foreground">
            Cathie Wood
          </h1>
          <p className="mb-0 break-words leading-[21px] text-muted-foreground">
            개인 계좌가 아니라 {fundName}({fund})의 공식 보유 자료입니다.
          </p>
        </div>
        <Badge
          className={
            ark.status === "ready"
              ? "border-success/30 bg-success/10 text-success"
              : ark.status === "error"
                ? "border-destructive/25 bg-destructive/10 text-destructive"
                : ark.status === "unconfigured"
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-border bg-card text-muted-foreground"
          }
          variant="outline"
        >
          {ark.status === "ready"
            ? "캐시 준비됨"
            : ark.status === "unconfigured"
              ? "설정 필요"
              : ark.status === "error"
                ? "조회 오류"
                : "데이터 없음"}
        </Badge>
      </div>

      <FundSelector current={fund} />

      <ArkRefresh
        fund={fund}
        lastAttemptAt={ark.lastAttemptAt}
        lastError={ark.lastError}
        stale={ark.stale}
        status={ark.status}
        syncing={ark.syncing}
      />

      {snapshot ? (
        <>
          <section
            aria-label="펀드 자료 정보"
            className="mb-5 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card min-[761px]:grid-cols-4"
          >
            <div className="grid min-w-0 gap-1.5 border-r border-b border-border p-4 min-[761px]:border-b-0">
              <span className="text-[11px] text-muted-foreground">펀드</span>
              <strong className="break-words text-xs font-semibold">
                {fundName}
              </strong>
            </div>
            <div className="grid min-w-0 gap-1.5 border-b border-border p-4 min-[761px]:border-r min-[761px]:border-b-0">
              <span className="text-[11px] text-muted-foreground">
                자료 기준일
              </span>
              <strong className="font-sans text-xs font-semibold tabular-nums">
                {snapshot.reportDate}
              </strong>
            </div>
            <div className="grid min-w-0 gap-1.5 border-r border-border p-4">
              <span className="text-[11px] text-muted-foreground">
                수집 성공 시각
              </span>
              <strong className="font-sans text-xs font-semibold tabular-nums">
                {ark.lastSuccessAt
                  ? `${collectedAtFormatter.format(new Date(ark.lastSuccessAt))} KST`
                  : "기록 없음"}
              </strong>
            </div>
            <div className="grid min-w-0 gap-1.5 p-4">
              <span className="text-[11px] text-muted-foreground">
                보유 항목
              </span>
              <strong className="font-sans text-xs font-semibold tabular-nums">
                {snapshot.holdings.length}개
              </strong>
            </div>
          </section>

          <ArkAllocationChart
            allocation={buildArkAllocation(snapshot.holdings)}
            fundName={fundName}
            reportDate={snapshot.reportDate}
          />

          <section
            aria-labelledby="ark-holdings-heading"
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">
                  {snapshot.fund} 공식 보유 · 저장 버전 {snapshot.version}
                </p>
                <h2
                  id="ark-holdings-heading"
                  className="mb-0 text-xl leading-7 font-semibold tracking-tight"
                >
                  보유 항목
                </h2>
              </div>
            </div>
            <HoldingCards holdings={snapshot.holdings} />
            <div className="hidden lg:block">
              <HoldingTable holdings={snapshot.holdings} />
            </div>
            <div className="px-4 pb-3 text-xs leading-5 text-muted-foreground">
              <p>
                티커는 ARK 원문 표기이며 "RKLB UQ"처럼 거래소 접미사가 붙을 수
                있습니다. 원문에 티커가 없으면 "—"로 표시하고 임의로 추정하지
                않습니다.
              </p>
              <p>
                평가금액 USD는 원문의 센트 단위 금액이며, 수량은 반올림 없이
                원문 표기를 그대로 보여 줍니다.
              </p>
              <p>
                공식 비중은 ARK가 공개한 원문 값이고 차트 비중은 평가금액에서
                다시 계산한 값입니다. 공식 비중 합계는 반올림 때문에 정확히
                100%가 아닐 수 있습니다.
              </p>
            </div>
          </section>
        </>
      ) : (
        <section
          className="rounded-lg border border-dashed border-border bg-card px-5 py-7"
          aria-label="펀드 자료 캐시 없음"
        >
          <strong className="text-sm font-semibold">
            {ark.status === "error"
              ? "캐시 조회에 실패했습니다"
              : "표시할 ARK 보유 자료가 없습니다"}
          </strong>
          <p className="mt-1.5 mb-0 max-w-xl text-[13px] leading-5 text-muted-foreground">
            {ark.status === "error"
              ? (ark.lastError ??
                "기존 캐시를 읽지 못했습니다. 다시 시도해 주세요.")
              : `${fundName}(${fund})의 동기화가 완료되면 검증된 펀드 보유 항목이 표시됩니다.`}
          </p>
        </section>
      )}

      <section
        aria-label="ARK 자료 안내"
        className="mt-7 border-t border-border pt-4"
      >
        <strong className="text-xs font-semibold">ARK 자료 안내</strong>
        <p className="mt-1 mb-0 max-w-3xl text-[13px] leading-5 text-muted-foreground">
          ARK가 공개한 펀드 보유 자료이며 개인 계좌나 실시간 매매가 아닙니다.
          공개 페이지에 접근할 수 없었던 기간의 일별 자료는 나중에 복원할 수
          없으므로 수집되지 않은 날짜는 비어 있을 수 있습니다.
        </p>
      </section>
    </AppShell>
  );
}
