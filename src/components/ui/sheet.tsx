"use client";

import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/*
 * shadcn/ui의 sheet를 프로젝트 토큰에 맞춘 로컬 구현이다. Radix Dialog를 그대로 감싼다.
 * 그래서 배경 스크롤 잠금·포커스 트랩·Escape와 바깥 클릭 닫기·닫힌 뒤 트리거로의 포커스 복귀·
 * 배경 aria-hidden은 이 파일이 아니라 Radix가 소유한다. 여기서는 시각 표현만 정한다.
 */

/** sheet 뿌리다. 열림 상태(open·defaultOpen·onOpenChange)는 Radix가 관리한다. */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

/** sheet를 여는 요소다. asChild로 넘긴 자식에 aria-expanded·aria-haspopup="dialog"가 붙는다. */
function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

/**
 * sheet를 닫는 요소다. asChild와 함께 쓰면 자식 클릭 한 번으로 닫힘과 이동이 함께 처리된다.
 * 닫힐 때 포커스는 Radix가 트리거로 되돌린다.
 */
function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

/** 문서 흐름 밖에 sheet를 그리는 포털이다. 스크롤·overflow 조상의 영향을 받지 않게 한다. */
function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

/** sheet 뒤를 덮는 반투명 막이다. 클릭은 Radix가 닫기로 처리하며 배경과의 대비를 낮춘다. */
function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-foreground/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * 화면 가장자리에 붙는 sheet 본문이다.
 * 입력: side(붙을 방향), showCloseButton(우측 상단 닫기 버튼 표시 여부), 나머지 Radix Content 속성.
 * 출력: 포털로 그린 패널. 위치·크기는 호출부 className이 덮어쓸 수 있고, 겹치는 유틸리티는 cn이 정리한다.
 * 슬라이드·페이드 애니메이션은 감소 모션 설정에서 끈다.
 */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-background shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 motion-reduce:animate-none",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
          side === "top" &&
            "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          // 아이콘만 있는 버튼이므로 화면 낭독기에는 sr-only 문구로 이름을 준다. 터치 영역은 44px을 유지한다.
          <SheetPrimitive.Close className="absolute top-3 right-3 grid size-11 place-items-center rounded-md text-muted-foreground transition-colors motion-reduce:transition-none hover:bg-muted hover:text-foreground">
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">닫기</span>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

/** sheet 상단 제목 영역이다. 제목·설명을 함께 두어 Radix가 요구하는 접근성 이름을 채운다. */
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  );
}

/** sheet 하단 동작 영역이다. 좁은 화면에서는 호출부가 세로로 쌓는다. */
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

/** sheet 제목이다. Radix가 이 요소로 대화상자의 접근성 이름을 만든다. */
function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  );
}

/** sheet 설명이다. 없으면 Radix가 접근성 경고를 내므로 호출부는 항상 함께 둔다. */
function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
