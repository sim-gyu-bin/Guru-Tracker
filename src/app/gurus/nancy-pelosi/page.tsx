import { AppShell } from "@/components/app-shell";
import { GuruLink } from "@/components/guru-link";
import { HouseRefresh } from "@/components/house-refresh";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  HOUSE_PTR_ASSET_TYPE_LABELS,
  HOUSE_PTR_OWNER_CODE_LABELS,
  HOUSE_PTR_TRANSACTION_TYPE_LABELS,
  type HousePtrTransaction,
} from "@/domain/house";
import { getHousePtrView } from "@/server/house";

// 요청마다 저장된 PTR 스냅샷과 동기화 상태를 읽으며 수집은 화면의 별도 보완 경로로 실행한다.
export const dynamic = "force-dynamic";

// 수집 시각은 한국 사용자 기준 KST로 표시한다. 공식 제출일·서명일·거래일은 원문 날짜를 그대로 유지한다.
const collectedAtFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

/** 원문이 비어 있는 값을 화면에서 빈칸으로 두지 않기 위한 표기. 값 자체는 만들지 않는다. */
const EMPTY = "—";

/** 자산유형 코드는 하원 공식 코드표 이름을 함께 보여 준다. 표에 없는 코드는 수집 단계에서 이미 실패한다. */
function assetTypeLabel(code: string): string {
  return `${code} · ${HOUSE_PTR_ASSET_TYPE_LABELS[code]}`;
}

/**
 * 거래유형은 하원 윤리위원회 Instruction Guide가 정의한 코드에만 한국어를 붙이고 원문 코드를 함께 남긴다.
 * 값이 사전에 없는 코드라면 파서가 이미 수집을 실패시켰으므로 여기서 임의 해석을 만들지 않는다.
 */
function transactionTypeLabel(code: string): string {
  return `${HOUSE_PTR_TRANSACTION_TYPE_LABELS[code]} · ${code}`;
}

/**
 * 소유자는 자산을 보유한 주체 표기이며 거래를 지시한 사람을 뜻하지 않는다.
 * 본인 보유는 양식이 기재를 생략하므로 "기재 없음"으로 표시하고 한국어 라벨을 만들지 않는다.
 */
function ownerLabel(code: string): string {
  return code ? `${HOUSE_PTR_OWNER_CODE_LABELS[code]} · ${code}` : "기재 없음";
}

/**
 * 모바일에서는 한 건씩 카드로 쌓아 가로 스크롤 없이 읽게 한다.
 * 자산명·설명은 원문 문자열이며 임의로 줄이지 않는다.
 */
function TransactionCards({
  transactions,
}: {
  transactions: readonly HousePtrTransaction[];
}) {
  return (
    <ul
      aria-label="거래 내역 카드"
      className="space-y-3 bg-background p-3 lg:hidden"
    >
      {transactions.map((transaction, index) => (
        <li
          // 원문에는 행 식별자가 없다. 문서 안 순서를 화면 표시용 키로만 쓴다.
          key={`${index}-${transaction.transactionDate}-${transaction.assetTypeCode}`}
          className="min-w-0 rounded-lg border border-border bg-card p-4"
        >
          <h3 className="[overflow-wrap:anywhere] text-sm leading-5 font-semibold">
            {transaction.asset}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {assetTypeLabel(transaction.assetTypeCode)}
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">거래유형</dt>
              <dd className="mt-1 text-sm font-semibold">
                {transactionTypeLabel(transaction.transactionType)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">소유자</dt>
              <dd className="mt-1 text-sm font-semibold">
                {ownerLabel(transaction.ownerCode)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">거래일</dt>
              <dd className="mt-1 break-all font-mono text-sm font-semibold tabular-nums">
                {transaction.transactionDate}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">통지일</dt>
              <dd className="mt-1 break-all font-mono text-sm font-semibold tabular-nums">
                {transaction.notificationDate ?? EMPTY}
              </dd>
            </div>
            <div className="min-w-0 min-[360px]:col-span-2">
              <dt className="text-[11px] text-muted-foreground">
                거래금액 범위
              </dt>
              <dd className="mt-1 font-mono text-sm font-semibold tabular-nums [overflow-wrap:anywhere]">
                {transaction.amountRange}
              </dd>
            </div>
          </dl>
          {transaction.filingStatus || transaction.details.length > 0 ? (
            <ul className="mt-3 space-y-1 text-[11px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">
              {transaction.filingStatus ? (
                <li>원문 표기 F S: {transaction.filingStatus}</li>
              ) : null}
              {transaction.details.map((detail, detailIndex) => (
                <li key={`${detailIndex}-${detail}`}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * 하원 PTR 거래 내역 표다.
 * 열은 공식 양식(소유자·자산·거래유형·거래일·통지일·금액)을 따르며 보유 수량·평가금액·비중 열은 없다.
 */
function TransactionTable({
  transactions,
}: {
  transactions: readonly HousePtrTransaction[];
}) {
  return (
    <Table className="min-w-[880px] text-xs">
      <TableHeader className="bg-muted/60">
        <TableRow className="hover:bg-muted/60">
          <TableHead
            scope="col"
            className="w-[36%] min-w-[240px] px-3 text-[11px] text-muted-foreground"
          >
            자산
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-[11px] text-muted-foreground"
          >
            자산유형
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-[11px] text-muted-foreground"
          >
            거래유형
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-[11px] text-muted-foreground"
          >
            거래일
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-[11px] text-muted-foreground"
          >
            통지일
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-[11px] text-muted-foreground"
          >
            거래금액 범위
          </TableHead>
          <TableHead
            scope="col"
            className="px-3 text-[11px] text-muted-foreground"
          >
            소유자
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction, index) => (
          <TableRow
            key={`${index}-${transaction.transactionDate}-${transaction.assetTypeCode}`}
          >
            <TableCell className="w-[36%] min-w-[240px] whitespace-normal px-3 [overflow-wrap:anywhere]">
              <span className="block">{transaction.asset}</span>
              {transaction.filingStatus || transaction.details.length > 0 ? (
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  {transaction.filingStatus
                    ? `원문 표기 F S: ${transaction.filingStatus} `
                    : ""}
                  {transaction.details.join(" ")}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="px-3">
              <span className="font-mono tabular-nums">
                {transaction.assetTypeCode}
              </span>
              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                {HOUSE_PTR_ASSET_TYPE_LABELS[transaction.assetTypeCode]}
              </span>
            </TableCell>
            <TableCell className="px-3">
              {transactionTypeLabel(transaction.transactionType)}
            </TableCell>
            <TableCell className="px-3 font-mono tabular-nums">
              {transaction.transactionDate}
            </TableCell>
            <TableCell className="px-3 font-mono tabular-nums">
              {transaction.notificationDate ?? EMPTY}
            </TableCell>
            <TableCell className="px-3 font-mono tabular-nums">
              {transaction.amountRange}
            </TableCell>
            <TableCell className="px-3">
              {ownerLabel(transaction.ownerCode)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Nancy Pelosi 화면은 미국 하원 공식 PTR(Periodic Transaction Report) 중 최신 제출 1건을 그대로 보여 준다.
 * 보유 목록·정확한 금액·수익률이 아니며, 원문을 검증하지 못하면 갱신만 보류하고
 * 이미 검증해 둔 스냅샷은 그대로 보여 준다(수집 실패가 기존 캐시를 지우지 않는다).
 */
export default async function NancyPelosiPage() {
  const house = await getHousePtrView();
  const snapshot = house.snapshot;

  return (
    <AppShell current="pelosi">
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
          Nancy Pelosi
        </span>
      </nav>

      <div className="mb-[22px] flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1.5 text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">
            미국 하원 PTR · 최신 제출 1건
          </p>
          <h1 className="mb-2 text-[25px] leading-8 font-semibold tracking-[-0.035em] text-foreground">
            Nancy Pelosi
          </h1>
          <p className="mb-0 break-words leading-[21px] text-muted-foreground">
            {snapshot
              ? `미국 하원에 제출된 ${snapshot.filerName}(${snapshot.filerStatus} · ${snapshot.stateDistrict})의 공식 PTR 최신 1건입니다.`
              : "미국 하원에 제출된 공식 PTR(정기거래보고서) 최신 1건을 보여 줍니다."}
          </p>
        </div>
        <Badge
          className={
            house.status === "ready"
              ? "border-success/30 bg-success/10 text-success"
              : house.status === "error"
                ? "border-destructive/25 bg-destructive/10 text-destructive"
                : house.status === "unconfigured"
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-border bg-card text-muted-foreground"
          }
          variant="outline"
        >
          {house.status === "ready"
            ? "캐시 준비됨"
            : house.status === "unconfigured"
              ? "설정 필요"
              : house.status === "error"
                ? "조회 오류"
                : "데이터 없음"}
        </Badge>
      </div>

      <HouseRefresh
        lastAttemptAt={house.lastAttemptAt}
        lastError={house.lastError}
        stale={house.stale}
        status={house.status}
        syncing={house.syncing}
      />

      {snapshot ? (
        <>
          <section
            aria-label="공시 정보"
            className="mb-5 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card min-[761px]:grid-cols-4"
          >
            <div className="grid min-w-0 gap-1.5 border-r border-b border-border p-4 min-[761px]:border-b-0">
              <span className="text-[11px] text-muted-foreground">
                문서번호
              </span>
              <strong className="font-mono text-xs font-semibold tabular-nums">
                {snapshot.documentId}
              </strong>
            </div>
            <div className="grid min-w-0 gap-1.5 border-b border-border p-4 min-[761px]:border-r min-[761px]:border-b-0">
              <span className="text-[11px] text-muted-foreground">제출일</span>
              <strong className="font-mono text-xs font-semibold tabular-nums">
                {snapshot.filingDate}
              </strong>
            </div>
            <div className="grid min-w-0 gap-1.5 border-r border-border p-4">
              <span className="text-[11px] text-muted-foreground">서명일</span>
              <strong className="font-mono text-xs font-semibold tabular-nums">
                {snapshot.signedAt ?? EMPTY}
              </strong>
            </div>
            <div className="grid min-w-0 gap-1.5 p-4">
              <span className="text-[11px] text-muted-foreground">
                수집 성공 시각
              </span>
              <strong className="font-mono text-xs font-semibold tabular-nums">
                {house.lastSuccessAt
                  ? `${collectedAtFormatter.format(new Date(house.lastSuccessAt))} KST`
                  : "기록 없음"}
              </strong>
            </div>
          </section>

          <section
            aria-labelledby="house-transactions-heading"
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">
                  Filing ID #{snapshot.documentId} · 저장 버전{" "}
                  {snapshot.version}
                </p>
                <h2
                  id="house-transactions-heading"
                  className="mb-0 text-base font-semibold tracking-[-0.02em]"
                >
                  거래 내역
                </h2>
              </div>
              <a
                className="min-h-11 content-center text-xs underline underline-offset-4 hover:text-foreground"
                href={snapshot.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                공식 원문 PDF 열기
              </a>
            </div>
            <TransactionCards transactions={snapshot.transactions} />
            <div className="hidden lg:block">
              <TransactionTable transactions={snapshot.transactions} />
            </div>
            <div className="space-y-1 px-4 pb-3 text-xs leading-5 text-muted-foreground">
              <p className="mb-0">
                거래금액은 공식 원문의 거래금액 범위 표기이며 체결 금액이
                아닙니다. 합계·중간값·비중을 계산하지 않고 원문 문자열을 그대로
                보여 줍니다.
              </p>
              <p className="mb-0">
                거래 건수 {snapshot.transactions.length}건은 공식 원문 1건의 표
                내용 전체입니다. 자산유형은 하원 공식 코드표 명칭을,
                거래유형·소유자는 하원 윤리위원회 안내서가 정의한 코드에 한해
                한국어를 원문 코드와 함께 표시하며 표에 없는 값은 해석하지
                않습니다.
              </p>
            </div>
          </section>
        </>
      ) : (
        <section
          className="rounded-lg border border-dashed border-border bg-card px-5 py-7"
          aria-label="공시 캐시 없음"
        >
          <strong className="text-sm font-semibold">
            {house.status === "error"
              ? "캐시 조회에 실패했습니다"
              : "표시할 하원 PTR 캐시가 없습니다"}
          </strong>
          <p className="mt-1.5 mb-0 max-w-xl text-[13px] leading-5 text-muted-foreground">
            {house.status === "error"
              ? (house.lastError ??
                "기존 캐시를 읽지 못했습니다. 다시 시도해 주세요.")
              : "동기화가 완료되면 검증된 최신 PTR 1건의 거래 내역이 표시됩니다."}
          </p>
        </section>
      )}

      <section
        aria-label="PTR 자료 안내"
        className="mt-7 border-t border-border pt-4"
      >
        <strong className="text-xs font-semibold">PTR 자료 안내</strong>
        <p className="mt-1 mb-0 max-w-3xl text-[13px] leading-5 text-muted-foreground">
          미국 하원 공식 공시(disclosures-clerk.house.gov)의 PTR 원문만 근거로
          하며 제3자 요약이나 13F를 사용하지 않습니다. PTR은 제출자가 신고한
          거래 내역이고 보유 목록·현재 보유 여부·수익률이 아니며, 금액은 원문이
          구간으로 적은 거래금액 범위입니다. 표시된 제출일·서명일·거래일은 공식
          원문 날짜이고 수집 성공 시각과 다릅니다.
        </p>
      </section>
    </AppShell>
  );
}
