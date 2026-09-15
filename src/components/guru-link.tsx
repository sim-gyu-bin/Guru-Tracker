"use client";

import Link, { useLinkStatus } from "next/link";
import { type ComponentPropsWithRef, useId } from "react";

import { usePendingNavigationRegistration } from "@/components/navigation-provider";

/**
 * 링크 이동이 진행 중인 동안 자기 id로 표시를 등록하는 내부 관찰자다.
 * useLinkStatus는 해당 Link가 제공하는 컨텍스트를 읽으므로 반드시 그 Link의 자식으로 렌더링한다.
 * pending이 끝나거나 이 링크가 사라지면 자기 소유분만 해제한다.
 */
function GuruLinkPendingObserver() {
  const { pending } = useLinkStatus();
  const id = useId();

  usePendingNavigationRegistration(id, pending);

  return null;
}

/**
 * next/link에 이동 중 표시 등록만 더한 클라이언트 래퍼다.
 * props·ref·children·이벤트·prefetch·접근성 속성을 그대로 넘기고, 새 탭·수정 키 클릭·외부 URL·
 * hash·동일 URL 판단은 next/link가 처리하도록 대신 가로채지 않는다.
 * 관찰자는 null만 렌더링하므로 기존 레이아웃과 DOM 구조를 바꾸지 않는다.
 */
export function GuruLink({
  children,
  ...props
}: ComponentPropsWithRef<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <GuruLinkPendingObserver />
    </Link>
  );
}
