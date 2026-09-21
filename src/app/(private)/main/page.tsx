import { ChevronRight, Link2Off } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { GuruLink } from "@/components/guru-link";
import { StanleyRefresh } from "@/components/stanley-refresh";
import { Badge } from "@/components/ui/badge";
import { isAdminRow } from "@/domain/access";
import type { ArkView } from "@/domain/ark";
import type { HousePtrView } from "@/domain/house";
import type { StanleyView } from "@/domain/sec";
import { requireApprovedPage } from "@/server/access";
import { getArkView } from "@/server/ark";
import { getHousePtrView } from "@/server/house";
import { getStanleyView } from "@/server/stanley";

// 빌드 시 서버 설정이 없어도 '설정 필요' 화면이 정적 산출물로 고정되지 않게 한다.
export const dynamic = "force-dynamic";

// 홈 목록은 ARK의 대표 펀드 ARKK 저장 상태만 요약한다. 펀드 선택은 Cathie 화면에서 한다.
const HOME_ARK_FUND = "ARKK" as const;

/** ARK 캐시 상태를 홈 카드 문구로 옮긴다. 수집하지 못한 상태를 보유 자료처럼 표시하지 않는다. */
const ARK_STATUS_LABELS: Record<ArkView["status"], string> = {
  ready: "ARKK · 공식 펀드 보유",
  empty: "ARKK · 자료 없음",
  error: "ARKK · 조회 오류",
  unconfigured: "ARKK · 설정 필요",
};

/** 하원 PTR 캐시 상태를 홈 카드 문구로 옮긴다. 수집하지 못한 상태를 제출 내역처럼 표시하지 않는다. */
const HOUSE_STATUS_LABELS: Record<HousePtrView["status"], string> = {
  ready: "미국 하원 PTR · 최신 제출 1건",
  empty: "PTR · 자료 없음",
  error: "PTR · 조회 오류",
  unconfigured: "PTR · 설정 필요",
};

/** Stanley SEC 13F 캐시 상태를 홈 카드 문구로 옮긴다. ready는 원문 검증을 통과한 스냅샷이 저장된 상태다. */
const STANLEY_STATUS_LABELS: Record<StanleyView["status"], string> = {
  ready: "SEC 13F · 공식 공시 저장됨",
  empty: "SEC 13F · 자료 없음",
  error: "SEC 13F · 조회 오류",
  unconfigured: "SEC 13F · 설정 필요",
};

/** 미연결 4인. 공식 출처 수집 경로를 검증하기 전까지 조회 화면을 연결하지 않는다. */
const UNAVAILABLE_GURUS = [
  { name: "Michael Burry", source: "SEC 13F" },
  { name: "Philippe Laffont", source: "SEC 13F" },
  { name: "Brad Gerstner", source: "SEC 13F" },
  { name: "David Tepper", source: "SEC 13F" },
] as const;

/** 카드가 표시하는 공식 메타데이터 한 행이다. 값은 저장된 캐시에서만 오며 없으면 '데이터 없음'이다. */
type GuruCardRow = Readonly<{ label: string; value: string }>;

type GuruCardProps = Readonly<{
  href: string;
  /** 아바타 약칭. 장식이므로 화면 낭독기에서는 숨긴다. */
  initials: string;
  name: string;
  /** 공식 출처 표기. SEC 13F / ARK 공식 / 하원 PTR만 쓴다. */
  sourceLabel: string;
  /** 캐시 상태 문구. ready·empty·error·unconfigured 의미를 그대로 전달한다. */
  statusLabel: string;
  rows: readonly GuruCardRow[];
}>;

/**
 * 조회 가능 대상을 한 장의 카드로 보여 주는 내부 컴포넌트다.
 * 이름·공식 출처·자료 기준일과 제출일을 화면 폭과 무관하게 숨기지 않으며, 모바일 1열·761px 이상 2열·1024px 이상 3열로 배치된다.
 * 수익률·실시간·추정 수치는 넣지 않는다. 값이 없는 행은 '데이터 없음'으로만 표시한다.
 */
function GuruCard({
  href,
  initials,
  name,
  sourceLabel,
  statusLabel,
  rows,
}: GuruCardProps) {
  return (
    <GuruLink
      className="flex flex-col gap-3.5 rounded-[9px] border border-success/25 bg-card px-4 py-4 no-underline transition-colors hover:border-success/45 hover:bg-interactive-subtle focus-visible:border-success/60 focus-visible:bg-interactive-subtle min-[761px]:px-5"
      href={href}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          {/* 출처 식별용 장식 타일이며, 자료 상태는 별도 문구로 전달한다. */}
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-[7px] bg-[linear-gradient(140deg,var(--interactive-subtle),color-mix(in_oklab,var(--success)_10%,transparent))] text-xs font-bold text-success"
          >
            {initials}
          </span>
          <span className="grid min-w-0 gap-1">
            <strong className="text-lg leading-7 font-semibold tracking-[-0.02em]">
              {name}
            </strong>
            <span className="text-sm leading-5 text-muted-foreground">
              {statusLabel}
            </span>
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="mt-2 size-4 shrink-0 text-muted-foreground/70"
        />
      </span>
      {/* 공식 출처 표기. 청록 계열 success 톤으로 통일하되 문구는 그대로 유지한다. */}
      <Badge
        className="h-auto w-fit self-start rounded-full border-success/30 bg-success/10 px-2 py-[3px] text-xs font-semibold text-success"
        variant="outline"
      >
        {sourceLabel}
      </Badge>
      <dl className="mt-auto mb-0 grid gap-2 border-t border-border pt-3">
        {rows.map((row) => (
          <div
            className="flex items-baseline justify-between gap-3"
            key={row.label}
          >
            <dt className="shrink-0 text-sm text-muted-foreground">
              {row.label}
            </dt>
            <dd className="m-0 min-w-0 text-right text-sm font-sans font-medium text-foreground tabular-nums [overflow-wrap:anywhere]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </GuruLink>
  );
}

/**
 * 저장된 Stanley SEC 13F와 ARK 펀드 보유, 하원 PTR 캐시를 조회 대상 카드로 보여 주는 홈 화면이다.
 * 캐시가 stale 또는 비어 있을 때만 클라이언트 갱신 제어부가 동기화를 요청하며, 수집하지 못한 상태를 보유 자료로 바꾸지 않는다.
 */
export default async function HomePage() {
  // 공시 자료를 읽기 전에 승인 상태를 서버에서 다시 확인한다. 승인되지 않은 요청은 여기서 끝난다.
  const row = await requireApprovedPage();
  const [stanley, ark, house] = await Promise.all([
    getStanleyView(),
    getArkView(HOME_ARK_FUND),
    getHousePtrView(),
  ]);
  const snapshot = stanley.snapshot;
  const arkSnapshot = ark.snapshot;
  const houseSnapshot = house.snapshot;

  return (
    <AppShell admin={isAdminRow(row)} current="home">
      {/*
        도입부 배경광. 색과 세기는 globals.css의 --glow-* 토큰이 정하므로 라이트·다크가 같은 마크업을 쓴다.
        움직이지 않는 정적 방사광만 쓰고, `isolate` 문맥 안에서 음수 z로 내용 뒤에만 깔린다.
      */}
      <div className="relative isolate mb-6 flex flex-col gap-4 min-[761px]:flex-row min-[761px]:items-start min-[761px]:justify-between min-[761px]:gap-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_20%_45%,var(--glow-blue),transparent_65%),radial-gradient(ellipse_at_80%_35%,var(--glow-green),transparent_65%)] blur-xl"
        />
        <div className="min-w-0">
          {/* 강조색은 제목 일부에만 쓰고, 다크의 파랑은 가독성이 높은 공통 토큰을 사용한다. */}
          <h1 className="mb-2 text-3xl leading-9 font-semibold tracking-tight">
            <span className="bg-linear-to-r from-interactive via-success to-primary bg-clip-text text-transparent dark:from-chart-2">
              공시
            </span>{" "}
            조회
          </h1>
          <p className="m-0 max-w-[720px] text-lg leading-7 text-muted-foreground">
            저장된 공시 캐시를 먼저 표시하고, 캐시가 비었거나 오래됐을 때만 공식
            출처에 갱신을 요청합니다.
          </p>
        </div>
        <Badge
          className="h-auto self-start rounded-full border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground"
          variant="outline"
        >
          Stanley · Cathie · Nancy 조회 지원
        </Badge>
      </div>

      <StanleyRefresh
        lastAttemptAt={stanley.lastAttemptAt}
        lastError={stanley.lastError}
        stale={stanley.stale}
        status={stanley.status}
        syncing={stanley.syncing}
      />

      <section aria-labelledby="connected-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2
              className="m-0 text-xl leading-7 font-semibold tracking-tight"
              id="connected-heading"
            >
              조회 가능 대상
            </h2>
            <p className="mt-1 mb-0 text-sm leading-5 text-muted-foreground">
              공식 원문을 대조해 저장한 캐시 기준입니다.
            </p>
          </div>
          {/*
            연결된 대상 수. 색만으로 구분하지 않도록 '3명' 문구를 그대로 둔다.
            배지는 페이지 배경 위 success/10 틴트라 text-success만으로는 4.25:1이므로,
            같은 success 토큰을 --foreground와 혼합해 4.5:1 이상을 확보한다(라이트 5.7:1, 다크 9.8:1).
          */}
          <Badge
            className="h-auto shrink-0 rounded-full border-success/30 bg-success/10 px-2.5 py-1 text-sm font-semibold text-[color:color-mix(in_oklab,var(--success)_78%,var(--foreground))]"
            variant="outline"
          >
            3명
          </Badge>
        </div>
        <div className="grid gap-3.5 min-[761px]:grid-cols-2 lg:grid-cols-3">
          <GuruCard
            href="/main/gurus/stanley-druckenmiller"
            initials="SD"
            name="Stanley Druckenmiller"
            sourceLabel="SEC 13F"
            statusLabel={STANLEY_STATUS_LABELS[stanley.status]}
            rows={[
              {
                label: "운용 기관",
                value: snapshot?.managerName ?? "데이터 없음",
              },
              {
                label: "자료 기준일",
                value: snapshot?.reportDate ?? "데이터 없음",
              },
              {
                label: "제출일",
                value: snapshot?.filingDate ?? "데이터 없음",
              },
            ]}
          />
          <GuruCard
            href="/main/gurus/cathie-wood"
            initials="CW"
            name="Cathie Wood"
            sourceLabel="ARK 공식"
            statusLabel={ARK_STATUS_LABELS[ark.status]}
            rows={[
              { label: "대표 펀드", value: HOME_ARK_FUND },
              {
                label: "자료 기준일",
                value: arkSnapshot?.reportDate ?? "데이터 없음",
              },
              {
                label: "보유 종목 수",
                value: arkSnapshot
                  ? `${arkSnapshot.holdings.length}건`
                  : "데이터 없음",
              },
            ]}
          />
          <GuruCard
            href="/main/gurus/nancy-pelosi"
            initials="NP"
            name="Nancy Pelosi"
            sourceLabel="하원 PTR"
            statusLabel={HOUSE_STATUS_LABELS[house.status]}
            rows={[
              {
                label: "제출일",
                value: houseSnapshot?.filingDate ?? "데이터 없음",
              },
              {
                label: "제출 거래 건수",
                value: houseSnapshot
                  ? `${houseSnapshot.transactions.length}건`
                  : "데이터 없음",
              },
              {
                label: "문서번호",
                value: houseSnapshot?.documentId ?? "데이터 없음",
              },
            ]}
          />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="unavailable-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2
              className="m-0 flex items-center gap-1.5 text-xl leading-7 font-semibold tracking-tight"
              id="unavailable-heading"
            >
              <Link2Off
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              미연결 대상
            </h2>
            <p className="mt-1 mb-0 max-w-[720px] text-sm leading-5 text-muted-foreground">
              공식 출처 수집 경로를 검증한 뒤 연결합니다. 현재는 조회 화면이
              없습니다.
            </p>
          </div>
          {/* 미연결 대상 수. 청록 배지와 대비되는 중립색으로 두되 '4명' 문구를 그대로 둔다. */}
          <Badge
            className="h-auto shrink-0 rounded-full border-border bg-muted/40 px-2.5 py-1 text-sm font-semibold text-muted-foreground"
            variant="outline"
          >
            4명
          </Badge>
        </div>
        <ul className="m-0 grid list-none gap-2.5 p-0 min-[761px]:grid-cols-2">
          {UNAVAILABLE_GURUS.map((guru) => (
            <li
              className="flex items-center justify-between gap-3 rounded-[9px] border border-border/70 bg-muted/25 px-4 py-3"
              key={guru.name}
            >
              <span className="grid min-w-0 gap-1">
                <span className="text-sm leading-5 font-medium text-muted-foreground">
                  {guru.name}
                </span>
                <span className="text-sm leading-5 text-muted-foreground">
                  {guru.source}
                </span>
              </span>
              <Badge
                className="h-auto shrink-0 rounded-full px-2 py-[3px] text-xs font-semibold text-muted-foreground"
                variant="ghost"
              >
                미연결
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="mt-9 border-t border-border pt-5"
        aria-label="공시 자료 안내"
      >
        <h2 className="m-0 text-xl leading-7 font-semibold tracking-tight">
          공시 자료 안내
        </h2>
        <ul className="mt-2.5 mb-0 grid max-w-[760px] list-none gap-2 p-0">
          <li className="text-sm leading-6 text-muted-foreground">
            SEC 13F는 기관 보유 현황 공시입니다. 실시간 거래 또는 개인 계좌를
            나타내지 않으며, 원문과 기준일을 함께 확인하세요.
          </li>
          <li className="text-sm leading-6 text-muted-foreground">
            ARK 보유 자료는 펀드가 공개한 공식 자료이며 개인 계좌나 실시간
            매매가 아닙니다. 수집 시각과 자료 기준일을 구분해 확인하세요.
          </li>
          <li className="text-sm leading-6 text-muted-foreground">
            Nancy Pelosi의 PTR은 미국 하원 공식
            공시(disclosures-clerk.house.gov)의 최신 제출 1건이며 보유 목록이
            아닙니다. 금액은 원문이 구간으로 적은 거래금액 범위이고
            제출일·거래일은 공식 날짜입니다.
          </li>
        </ul>
      </section>
    </AppShell>
  );
}
