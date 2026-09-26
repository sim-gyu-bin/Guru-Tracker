"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGuruRouter } from "@/hooks/use-guru-router";

type AdminTab = "approvals" | "sync";

type AdminTabsProps = Readonly<{
  activeTab: AdminTab;
  approvals: ReactNode;
  pendingCount: number;
  sync: ReactNode;
}>;

/**
 * 운영 관리의 URL 기반 탭 전환을 담당한다.
 *
 * 서버가 승인·동기화 슬롯과 현재 URL에서 판정한 탭을 전달한다. 선택은 URL만 변경하며 승인 관련
 * 쿼리는 탭 전환 때 제거한다. 같은 탭을 다시 선택하면 이동하지 않아 공통 상단 프로그래스를 중복 실행하지 않는다.
 */
export function AdminTabs({
  activeTab,
  approvals,
  pendingCount,
  sync,
}: AdminTabsProps) {
  const router = useGuruRouter();

  function selectTab(nextTab: string) {
    if (nextTab !== "approvals" && nextTab !== "sync") return;
    if (nextTab === activeTab) return;
    router.push(nextTab === "sync" ? "/admin?tab=sync" : "/admin", {
      scroll: false,
    });
  }

  return (
    <Tabs
      className="mt-5"
      activationMode="manual"
      onValueChange={selectTab}
      value={activeTab}
    >
      <TabsList aria-label="운영 관리 항목">
        <TabsTrigger value="approvals">
          가입 승인
          <Badge aria-label={`승인 대기 ${pendingCount}건`} variant="outline">
            {pendingCount}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="sync">동기화 상태</TabsTrigger>
      </TabsList>
      <TabsContent value="approvals">{approvals}</TabsContent>
      <TabsContent value="sync">{sync}</TabsContent>
    </Tabs>
  );
}
