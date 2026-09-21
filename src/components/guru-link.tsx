"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentPropsWithRef, useRef } from "react";

import { useNavigationController } from "@/components/navigation-provider";

/**
 * Next Link의 ref·prefetch·클릭 판별을 유지하되 실제 이동 전이는 루트에 귀속한다.
 * onNavigate 사용자 취소를 먼저 존중하며, 새 탭·수정키·다운로드는 Next가 걸러낸다.
 * DOM에서 해석한 URL을 사용하므로 object href와 as도 Next가 만든 주소 그대로 이동한다.
 */
export function GuruLink({
  onClick,
  onNavigate,
  replace,
  scroll,
  ...props
}: ComponentPropsWithRef<typeof Link>) {
  const router = useRouter();
  const { transition } = useNavigationController();
  const destination = useRef("");

  return (
    <Link
      {...props}
      replace={replace}
      scroll={scroll}
      onClick={(event) => {
        destination.current = event.currentTarget.href;
        onClick?.(event);
      }}
      onNavigate={(event) => {
        let cancelled = false;
        onNavigate?.({
          preventDefault() {
            cancelled = true;
            event.preventDefault();
          },
        });
        if (cancelled) return;
        event.preventDefault();
        const href = destination.current;
        transition(() => {
          if (replace) router.replace(href, { scroll });
          else router.push(href, { scroll });
        }, href);
      }}
    />
  );
}
