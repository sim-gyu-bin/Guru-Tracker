import type { ReactNode } from "react";

import { GuruLink } from "@/components/guru-link";
import {
  MobileNavigation,
  type TrackedTargetItem,
} from "@/components/mobile-navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** 화면 식별자다. 데스크톱 사이드바와 좁은 화면 메뉴가 같은 값으로 선택 상태를 판단한다. */
type CurrentScreen =
  | "home"
  | "stanley"
  | "burry"
  | "cathie"
  | "pelosi"
  | "laffont"
  | "gerstner"
  | "tepper"
  | "admin";

/**
 * 공식 출처가 연결된 추적 대상 목록이다.
 * 화면 식별자·이동 경로·출처 표기를 한곳에서 정의해 두 탐색이 같은 내용을 쓰도록 한다.
 * 실제 연결 여부는 서버 데이터가 정하며, 여기서는 이미 연결된 경로만 담는다.
 */
const trackedGurus = [
  {
    screen: "stanley",
    name: "Stanley Druckenmiller",
    href: "/main/gurus/stanley-druckenmiller",
    source: "SEC 13F",
  },
  {
    screen: "burry",
    name: "Michael Burry",
    href: "/main/gurus/michael-burry",
    source: "SEC 13F",
  },
  {
    screen: "cathie",
    name: "Cathie Wood",
    href: "/main/gurus/cathie-wood",
    source: "ARK 공식",
  },
  {
    screen: "pelosi",
    name: "Nancy Pelosi",
    href: "/main/gurus/nancy-pelosi",
    source: "하원 PTR",
  },
  {
    screen: "laffont",
    name: "Philippe Laffont",
    href: "/main/gurus/philippe-laffont",
    source: "SEC 13F",
  },
  {
    screen: "gerstner",
    name: "Brad Gerstner",
    href: "/main/gurus/brad-gerstner",
    source: "SEC 13F",
  },
  {
    screen: "tepper",
    name: "David Tepper",
    href: "/main/gurus/david-tepper",
    source: "SEC 13F",
  },
] as const satisfies readonly {
  screen: CurrentScreen;
  name: string;
  href: string;
  source: string;
}[];

type AppShellProps = Readonly<{
  children: ReactNode;
  current?: CurrentScreen;
  /** 관리자에게만 보이는 승인 화면 링크를 켠다. 판정은 서버가 하며 이 값은 표시만 바꾼다. */
  admin?: boolean;
}>;

/**
 * 공시 조회 화면의 공통 탐색 프레임이다.
 * 761px 이상은 고정 사이드바, 그보다 좁은 화면은 같은 목록을 담은 상단 메뉴 버튼으로 탐색한다.
 * 연결된 일곱 대상의 경로만 링크로 제공한다. 로그인한 사용자의 로그아웃과 관리자의 승인 화면 이동은 넓은 화면에서 머리말에, 좁은 화면에서 메뉴 안에 둔다.
 */
export function AppShell({
  children,
  current = "home",
  admin = false,
}: AppShellProps) {
  // 두 탐색이 같은 선택 상태를 쓰도록 현재 화면 판정을 한 번만 계산한다.
  const targets: readonly TrackedTargetItem[] = trackedGurus.map((guru) => ({
    name: guru.name,
    href: guru.href,
    source: guru.source,
    active: guru.screen === current,
  }));

  return (
    <div className="min-h-dvh">
      <aside
        className="fixed inset-y-0 left-0 z-2 hidden w-[248px] flex-col border-r border-border bg-sidebar px-3 py-[18px] min-[761px]:flex"
        aria-label="주 탐색"
      >
        <GuruLink
          className="flex min-h-9 items-center gap-[9px] px-2 text-sm font-bold tracking-[-0.02em]"
          href="/main"
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
          {targets.map((target) => (
            <GuruLink
              className={`flex min-h-9 items-center justify-between gap-2 rounded-md px-2 py-[7px] text-[13px] leading-[18px] hover:bg-muted ${
                target.active
                  ? "bg-accent font-semibold text-accent-foreground"
                  : "text-muted-foreground"
              }`}
              href={target.href}
              key={target.name}
            >
              <span>{target.name}</span>
              <Badge
                className="h-auto px-0 py-0 text-[10px] font-medium text-muted-foreground"
                variant="ghost"
              >
                {target.source}
              </Badge>
            </GuruLink>
          ))}
        </nav>

        <p className="mx-2 mt-auto mb-1 text-[11px] leading-[17px] text-muted-foreground">
          공시 원문과 저장된 캐시를 우선 표시합니다. 보유 현황은 실시간 거래
          정보가 아닙니다.
        </p>
      </aside>

      <div className="min-h-dvh min-[761px]:ml-[248px]">
        <header className="sticky top-0 z-1 flex min-h-[50px] items-center gap-2 border-b border-border bg-card/92 px-4 py-2 backdrop-blur-[10px] min-[761px]:min-h-[52px] min-[761px]:px-8">
          {/* 좁은 화면의 주 탐색 입구다. 761px 이상에서는 사이드바가 그 역할을 대신한다. */}
          <MobileNavigation admin={admin} targets={targets} unavailable={[]} />
          <GuruLink
            className="inline-flex min-h-11 items-center text-xl font-bold min-[761px]:hidden"
            href="/main"
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
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {/* 관리자 이동과 로그아웃은 좁은 화면에서 메뉴 안으로 옮겨 머리말이 넘치지 않게 한다. */}
            <div className="hidden items-center gap-2 min-[761px]:flex">
              {admin ? (
                <Button asChild className="h-11 px-3" variant="outline">
                  <GuruLink href="/admin">가입 승인</GuruLink>
                </Button>
              ) : null}
              {/* 로그아웃은 상태를 바꾸므로 링크가 아니라 같은 출처 POST로만 실행한다. */}
              <form action="/auth/signout" method="post">
                <Button className="h-11 px-3" type="submit" variant="outline">
                  로그아웃
                </Button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-10 min-[761px]:px-8 min-[761px]:pt-[38px] min-[761px]:pb-14">
          {children}
        </main>
      </div>
    </div>
  );
}
