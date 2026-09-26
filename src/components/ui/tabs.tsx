"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/** Radix 기반 탭의 상태와 접근성 속성을 보존하는 루트다. */
function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

/** 탭 트리거를 한 행으로 묶어 키보드 탐색 순서를 유지한다. */
function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex min-h-14 w-full items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 min-[761px]:w-fit",
        className,
      )}
      {...props}
    />
  );
}

/** 현재 탭을 색상·테두리·포커스 링으로 함께 표시하는 44px 높이 선택 제어다. */
function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm min-[761px]:flex-none",
        className,
      )}
      {...props}
    />
  );
}

/** 선택된 탭의 콘텐츠만 문서 흐름에 렌더링해 비활성 폼을 포커스 대상에서 제외한다. */
function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
