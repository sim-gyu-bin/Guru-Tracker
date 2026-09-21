"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { useNavigationController } from "@/components/navigation-provider";

// next/navigation은 AppRouterInstance 타입을 공개로 내보내지 않으므로,
// 내부 경로(next/dist)를 직접 참조하는 대신 public useRouter 시그니처에서 필요한 타입만 파생한다.
type BaseRouter = ReturnType<typeof useRouter>;
type NavigateOptions = Parameters<BaseRouter["push"]>[1];
type PrefetchOptions = Parameters<BaseRouter["prefetch"]>[1];

/** next/navigation useRouter와 같은 6개 메서드만 공개하는 프로그램 이동 라우터다. */
type GuruRouter = Pick<
  BaseRouter,
  "back" | "forward" | "refresh" | "push" | "replace" | "prefetch"
>;

/**
 * 프로그램 이동을 GuruLink와 같은 Provider 전이·이동 중 표시에 묶는 클라이언트 훅이다.
 * push·replace는 중앙 전이로 감싸고, back·forward는 실제 popstate가 발생할 때 Provider가 표시한다.
 * 이동할 방문 기록이 없는 back·forward와 prefetch·refresh는 거짓 진행 표시를 만들지 않는다.
 * 입력: 없음. 출력: useRouter와 동일한 6개 메서드.
 */
export function useGuruRouter(): GuruRouter {
  const nextRouter = useRouter();
  const { transition } = useNavigationController();

  return useMemo<GuruRouter>(
    () => ({
      back(): void {
        nextRouter.back();
      },
      forward(): void {
        nextRouter.forward();
      },
      refresh(): void {
        nextRouter.refresh();
      },
      push(href: string, options?: NavigateOptions): void {
        transition(() => {
          nextRouter.push(href, options);
        }, href);
      },
      replace(href: string, options?: NavigateOptions): void {
        transition(() => {
          nextRouter.replace(href, options);
        }, href);
      },
      prefetch(href: string, options?: PrefetchOptions): void {
        nextRouter.prefetch(href, options);
      },
    }),
    [nextRouter, transition],
  );
}
