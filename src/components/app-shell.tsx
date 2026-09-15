import type { ReactNode } from "react";

import { GuruLink } from "@/components/guru-link";
import { Badge } from "@/components/ui/badge";

const unavailableGurus = [
  "Nancy Pelosi",
  "Michael Burry",
  "Philippe Laffont",
  "Brad Gerstner",
  "David Tepper",
] as const;

type AppShellProps = Readonly<{
  children: ReactNode;
  current?: "home" | "stanley" | "cathie";
}>;

/**
 * 공시 조회 화면의 공통 탐색 프레임이다.
 * 연결된 Stanley·Cathie 경로만 링크로 제공하며, 나머지 대상은 미연결 상태를 명확히 표시한다.
 */
export function AppShell({ children, current = "home" }: AppShellProps) {
  return (
    <div className="min-h-dvh">
      <aside
        className="fixed inset-y-0 left-0 z-2 hidden w-[248px] flex-col border-r border-border bg-sidebar px-3 py-[18px] min-[761px]:flex"
        aria-label="주 탐색"
      >
        <GuruLink
          className="flex min-h-9 items-center gap-[9px] px-2 text-sm font-bold tracking-[-0.02em]"
          href="/"
        >
          <span
            className="grid size-[23px] place-items-center rounded-md bg-foreground text-[9px] tracking-[-0.08em] text-primary-foreground"
            aria-hidden="true"
          >
            GT
          </span>
          <span>Guru Tracker</span>
        </GuruLink>

        <nav className="mt-8 grid gap-0.5" aria-label="추적 대상">
          <p className="mb-1.5 mx-2 text-[11px] font-semibold text-muted-foreground">
            추적 대상
          </p>
          <GuruLink
            className={`flex min-h-9 items-center justify-between gap-2 rounded-md px-2 py-[7px] text-[13px] leading-[18px] hover:bg-muted ${
              current === "stanley"
                ? "bg-accent font-semibold text-accent-foreground"
                : "text-muted-foreground"
            }`}
            href="/gurus/stanley-druckenmiller"
          >
            <span>Stanley Druckenmiller</span>
            <Badge
              className="h-auto px-0 py-0 text-[10px] font-medium text-muted-foreground"
              variant="ghost"
            >
              SEC 13F
            </Badge>
          </GuruLink>
          <GuruLink
            className={`flex min-h-9 items-center justify-between gap-2 rounded-md px-2 py-[7px] text-[13px] leading-[18px] hover:bg-muted ${
              current === "cathie"
                ? "bg-accent font-semibold text-accent-foreground"
                : "text-muted-foreground"
            }`}
            href="/gurus/cathie-wood"
          >
            <span>Cathie Wood</span>
            <Badge
              className="h-auto px-0 py-0 text-[10px] font-medium text-muted-foreground"
              variant="ghost"
            >
              ARK 공식
            </Badge>
          </GuruLink>
          {unavailableGurus.map((guru) => (
            <span
              className="flex min-h-9 cursor-default items-center justify-between gap-2 rounded-md px-2 py-[7px] text-[13px] leading-[18px] text-muted-foreground"
              key={guru}
            >
              <span>{guru}</span>
              <Badge
                className="h-auto px-0 py-0 text-[10px] font-medium text-muted-foreground"
                variant="ghost"
              >
                미연결
              </Badge>
            </span>
          ))}
        </nav>

        <p className="mx-2 mt-auto mb-1 text-[11px] leading-[17px] text-muted-foreground">
          공시 원문과 저장된 캐시를 우선 표시합니다. 보유 현황은 실시간 거래
          정보가 아닙니다.
        </p>
      </aside>

      <div className="min-h-dvh min-[761px]:ml-[248px]">
        <header className="sticky top-0 z-1 flex min-h-[50px] items-center justify-between border-b border-border bg-card/92 px-4 backdrop-blur-[10px] min-[761px]:min-h-[52px] min-[761px]:px-8">
          <GuruLink
            className="inline-flex min-h-11 items-center text-sm font-bold min-[761px]:hidden"
            href="/"
          >
            Guru Tracker
          </GuruLink>
          <div className="hidden items-center gap-[7px] text-xs text-muted-foreground min-[761px]:flex">
            <span
              className="size-1.5 rounded-full bg-success"
              aria-hidden="true"
            />
            <span>공식 공시</span>
          </div>
          <span className="text-xs text-muted-foreground">캐시 우선</span>
        </header>
        <main className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-10 min-[761px]:px-8 min-[761px]:pt-[38px] min-[761px]:pb-14">
          {children}
        </main>
      </div>
    </div>
  );
}
