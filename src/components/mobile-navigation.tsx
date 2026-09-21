"use client";

import { Menu, X } from "lucide-react";

import { GuruLink } from "@/components/guru-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** 좁은 화면 탐색에 표시할 추적 대상 한 명이다. active는 현재 화면과 일치하는지 여부만 담는다. */
export type TrackedTargetItem = Readonly<{
  name: string;
  href: string;
  /** 공식 출처 이름이다. 예: "SEC 13F". */
  source: string;
  active: boolean;
}>;

type MobileNavigationProps = Readonly<{
  /** 관리자 승인 화면 항목을 넣을지 여부. 판정은 서버가 하고 이 값은 표시만 바꾼다. */
  admin: boolean;
  /** 공식 출처가 연결되어 이동할 수 있는 대상이다. */
  targets: readonly TrackedTargetItem[];
  /** 공식 출처가 아직 연결되지 않아 이동할 수 없는 대상 이름이다. */
  unavailable: readonly string[];
}>;

// 메뉴 항목 줄의 공통 모양이다. 본문보다 큰 24px medium을 쓰고, 터치 영역은 48px 이상을 유지한다.
const itemClassName =
  "flex min-h-12 items-center justify-between gap-2 rounded-lg px-2 py-2 text-2xl leading-8 font-medium";

// 구역 이름표 모양이다. 데스크톱 사이드바와 같은 위계를 유지한다.
const sectionLabelClassName =
  "mx-2 mb-1.5 text-[11px] font-semibold text-muted-foreground";

/**
 * 좁은 화면(<=760px)의 상단 왼쪽 메뉴 버튼과 전체 높이 탐색 패널을 제공한다.
 * 입력: admin(관리자 항목 노출 여부), targets(연결된 추적 대상), unavailable(미연결 대상 이름).
 * 출력: 761px 이상에서는 숨는 메뉴 버튼과, 열렸을 때만 그려지는 Radix Dialog 기반 sheet.
 * 불변 조건: 대상·관리자 항목은 닫기 요소를 겸해 이동과 닫힘이 한 번의 조작으로 끝나고,
 * Escape·바깥 클릭·닫기 버튼·배경 스크롤 잠금·포커스 트랩과 복귀는 Radix가 처리한다.
 * 패널은 제목·닫기 영역과 계정 영역을 고정하고 가운데 목록만 스크롤해, 짧은 화면에서도 닫기 수단이 사라지지 않는다.
 * 실패 조건: 없음. 서버 값이 없으면 admin이 false로 전달되어 관리자 구역만 빠진다.
 */
export function MobileNavigation({
  admin,
  targets,
  unavailable,
}: MobileNavigationProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {/* 아이콘만 있는 버튼이라 화면 낭독기용 이름을 aria-label로 준다. 데스크톱은 사이드바가 탐색을 맡는다. */}
        <Button
          aria-label="탐색 메뉴 열기"
          className="size-11 min-[761px]:hidden"
          size="icon-lg"
          variant="outline"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>

      <SheetContent
        className="h-dvh w-[86vw] max-w-[22rem] gap-0 bg-sidebar"
        showCloseButton={false}
        side="left"
      >
        <div className="flex items-start justify-between gap-2 px-3 pt-[calc(18px+env(safe-area-inset-top))] pb-3">
          <SheetHeader className="gap-1 p-0 pl-2">
            <SheetTitle className="text-sm font-bold tracking-[-0.02em]">
              탐색
            </SheetTitle>
            <SheetDescription className="text-[11px] leading-[17px]">
              추적 대상과 계정 메뉴
            </SheetDescription>
          </SheetHeader>
          <SheetClose asChild>
            <Button
              aria-label="탐색 메뉴 닫기"
              className="size-11 shrink-0"
              size="icon-lg"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <nav aria-label="추적 대상" className="grid gap-0.5">
            <p className={sectionLabelClassName}>추적 대상</p>
            {targets.map((target) => (
              <SheetClose asChild key={target.name}>
                <GuruLink
                  className={`${itemClassName} ${
                    target.active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                  href={target.href}
                >
                  <span>{target.name}</span>
                  <Badge
                    className="h-auto px-0 py-0 text-xs font-medium text-muted-foreground"
                    variant="ghost"
                  >
                    {target.source}
                  </Badge>
                </GuruLink>
              </SheetClose>
            ))}
            {unavailable.map((guru) => (
              <span
                className={`${itemClassName} cursor-default text-muted-foreground`}
                key={guru}
              >
                <span>{guru}</span>
                <Badge
                  className="h-auto px-0 py-0 text-xs font-medium text-muted-foreground"
                  variant="ghost"
                >
                  미연결
                </Badge>
              </span>
            ))}
          </nav>

          {admin ? (
            <nav
              aria-label="관리자"
              className="mt-7 grid gap-0.5 border-t border-border pt-5"
            >
              <p className={sectionLabelClassName}>관리자</p>
              <SheetClose asChild>
                <GuruLink
                  className={`${itemClassName} text-muted-foreground hover:bg-muted`}
                  href="/admin"
                >
                  <span>가입 승인</span>
                </GuruLink>
              </SheetClose>
            </nav>
          ) : null}
        </div>

        <div className="border-t border-border px-3 pt-4 pb-[calc(18px+env(safe-area-inset-bottom))]">
          <p className={sectionLabelClassName}>계정</p>
          {/* 로그아웃은 상태를 바꾸므로 링크가 아니라 같은 출처 POST로만 실행한다. */}
          <form action="/auth/signout" method="post">
            <Button
              className="h-12 w-full justify-start px-2 text-2xl leading-8 font-medium text-muted-foreground"
              type="submit"
              variant="ghost"
            >
              로그아웃
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
