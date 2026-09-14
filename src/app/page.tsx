import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { StanleyRefresh } from "@/components/stanley-refresh";
import { Badge } from "@/components/ui/badge";
import { getStanleyView } from "@/server/stanley";

// 빌드 시 서버 설정이 없어도 '설정 필요' 화면이 정적 산출물로 고정되지 않게 한다.
export const dynamic = "force-dynamic";

/**
 * 저장된 Stanley SEC 13F 캐시를 작업 목록으로 보여 주는 홈 화면이다.
 * 캐시가 stale 또는 비어 있을 때만 클라이언트 갱신 제어부가 동기화를 요청한다.
 */
export default async function HomePage() {
  const stanley = await getStanleyView();
  const snapshot = stanley.snapshot;

  return (
    <AppShell current="home">
      <div className="mb-[22px] grid gap-3 min-[761px]:mb-7 min-[761px]:flex min-[761px]:items-start min-[761px]:justify-between min-[761px]:gap-6">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">
            공시 작업 공간
          </p>
          <h1 className="mb-2 text-[23px] leading-8 font-bold tracking-[-0.035em] min-[761px]:text-[25px]">
            추적 현황
          </h1>
          <p className="mb-0 leading-[21px] text-muted-foreground">
            공식 원문을 검증해 저장한 공시 캐시를 먼저 표시합니다.
          </p>
        </div>
        <Badge
          className="h-auto justify-self-start rounded-full border-border bg-card px-[9px] py-[5px] text-[11px] font-semibold text-muted-foreground"
          variant="outline"
        >
          Stanley 조회 지원
        </Badge>
      </div>

      <StanleyRefresh
        lastAttemptAt={stanley.lastAttemptAt}
        lastError={stanley.lastError}
        stale={stanley.stale}
        status={stanley.status}
        syncing={stanley.syncing}
      />

      <section
        className="overflow-hidden rounded-[9px] border border-border bg-card"
        aria-labelledby="tracked-heading"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-[14px] py-[14px] min-[761px]:items-center min-[761px]:px-[18px] min-[761px]:py-[15px]">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">
              데이터셋
            </p>
            <h2
              className="mb-0 text-base font-bold tracking-[-0.02em]"
              id="tracked-heading"
            >
              추적 대상
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">공식 출처 기준</span>
        </div>
        <div className="grid">
          <Link
            className="flex min-h-[68px] items-center gap-3 border-b border-border px-[14px] py-2.5 no-underline hover:bg-accent/30 min-[761px]:min-h-16 min-[761px]:px-[18px]"
            href="/gurus/stanley-druckenmiller"
          >
            <span
              className="grid size-[30px] shrink-0 place-items-center rounded-[7px] bg-accent text-[10px] font-bold text-accent-foreground"
              aria-hidden="true"
            >
              SD
            </span>
            <span className="grid min-w-0 gap-0.5">
              <strong className="text-[13px]">Stanley Druckenmiller</strong>
              <span className="truncate text-xs text-muted-foreground">
                {snapshot?.managerName ?? "SEC 13F 캐시 대기"}
              </span>
            </span>
            <span className="ml-auto hidden text-right text-[11px] leading-4 text-muted-foreground min-[761px]:grid">
              <span>SEC 13F</span>
              <span>
                {snapshot ? `기준일 ${snapshot.reportDate}` : "데이터 없음"}
              </span>
            </span>
            <span
              className="ml-auto text-xl text-muted-foreground/70 min-[761px]:ml-[9px]"
              aria-hidden="true"
            >
              ›
            </span>
          </Link>
          {[
            "Cathie Wood · ARK 공식 holdings/trades",
            "Nancy Pelosi · 미국 하원 공식 PTR",
            "Michael Burry · SEC 13F",
            "Philippe Laffont · SEC 13F",
            "Brad Gerstner · SEC 13F",
            "David Tepper · SEC 13F",
          ].map((item) => (
            <div
              className="flex min-h-[68px] items-center gap-3 border-b border-border px-[14px] py-2.5 text-muted-foreground last:border-b-0 min-[761px]:min-h-16 min-[761px]:px-[18px]"
              key={item}
            >
              <span
                className="grid size-[30px] shrink-0 place-items-center rounded-[7px] bg-muted text-[10px] font-bold text-muted-foreground/60"
                aria-hidden="true"
              >
                —
              </span>
              <span className="grid min-w-0 gap-0.5">
                <strong className="text-[13px]">{item.split(" · ")[0]}</strong>
                <span className="truncate text-xs text-muted-foreground">
                  {item.split(" · ")[1]}
                </span>
              </span>
              <span className="ml-auto whitespace-nowrap text-right text-[11px] leading-4 text-muted-foreground">
                미연결
              </span>
            </div>
          ))}
        </div>
      </section>

      <section
        className="mt-[22px] border-t border-border pt-[17px] min-[761px]:mt-7"
        aria-label="공시 해석 안내"
      >
        <strong className="text-xs">13F 공시 안내</strong>
        <p className="mt-[5px] mb-0 max-w-[760px] text-xs leading-[19px] text-muted-foreground">
          SEC 13F는 기관 보유 현황 공시입니다. 실시간 거래 또는 개인 계좌를
          나타내지 않으며, 원문과 기준일을 함께 확인하세요.
        </p>
      </section>
    </AppShell>
  );
}
