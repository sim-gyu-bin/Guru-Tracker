"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { flushSync } from "react-dom";

/** 루트 전이를 실행한다. href가 있으면 동일 문서·해시 이동을 표시에서 제외한다. */
type NavigationController = {
  transition(callback: () => void | Promise<void>, href?: string): void;
};

type NavigationState = {
  id: number;
  kind: "transition" | "document";
  destination: string;
  origin: string;
  status: "pending" | "complete" | "cancelled";
};

const NavigationControllerContext = createContext<NavigationController | null>(
  null,
);

/** 이동 상태는 링크 수명이 아닌 루트 Provider가 소유하며, Provider 밖 호출은 오류다. */
export function useNavigationController(): NavigationController {
  const controller = useContext(NavigationControllerContext);
  if (!controller) {
    throw new Error(
      "이동 상태 훅은 NavigationProvider 안에서만 사용할 수 있습니다.",
    );
  }
  return controller;
}

function routeKey(url: URL): string {
  return `${url.pathname}${url.search}`;
}

/** 검색 파라미터 읽기의 Suspense 경계를 분리해 루트 전체의 CSR 전환을 피한다. */
function NavigationCommitObserver({
  onCommit,
}: {
  onCommit(key: string): void;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const key = `${pathname}${search.size ? `?${search.toString()}` : ""}`;
  useLayoutEffect(() => onCommit(key), [key, onCommit]);
  return null;
}

/**
 * 실제 전송량이 아닌 대기 연출이다. 시작은 즉시, 100%는 실제 완료 뒤에만 표시한다.
 * 타이머는 완료 연출과 페이드에만 쓰며 이동 성공을 추정하지 않는다. 취소는 채우지 않는다.
 */
function NavigationProgressIndicator({
  state,
}: {
  state: NavigationState | null;
}) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0.08);
  useLayoutEffect(() => {
    if (!state) return;
    let advance: number | undefined;
    let hide: number | undefined;
    if (state.status === "pending") {
      setVisible(true);
      setProgress(0.08);
      advance = window.setInterval(
        () => setProgress((value) => value + (0.94 - value) * 0.14),
        400,
      );
    } else if (state.status === "complete") {
      setVisible(true);
      setProgress(1);
      hide = window.setTimeout(() => setVisible(false), 350);
    } else {
      setVisible(false);
    }
    return () => {
      clearInterval(advance);
      clearTimeout(hide);
    };
  }, [state]);
  return (
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 transition-opacity duration-150 motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`}
      >
        <div
          className="h-full origin-left bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <span aria-live="polite" className="sr-only">
        {state?.status === "pending" ? "페이지 이동 중" : ""}
      </span>
    </>
  );
}

/**
 * 링크가 Sheet와 함께 사라져도 살아 있는 루트 전이 소유자다.
 * React 전이 종료는 성공·실패 모두 대기를 끝내고, 목적지 커밋만 성공 연출로 판정한다.
 * 문서 이동은 pagehide/pageshow 및 브라우저 Navigation API 오류로 수명을 관리한다.
 */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<NavigationState | null>(null);
  const active = useRef<NavigationState | null>(null);
  const sequence = useRef(0);
  const committed = useRef("");
  const [isPending, startTransition] = useTransition();

  const finish = useCallback((status: "complete" | "cancelled") => {
    if (active.current?.status !== "pending") return;
    const next = { ...active.current, status };
    active.current = next;
    setState(next);
  }, []);

  const begin = useCallback(
    (kind: NavigationState["kind"], destination: string) => {
      const next: NavigationState = {
        id: ++sequence.current,
        kind,
        destination,
        origin: committed.current,
        status: "pending",
      };
      active.current = next;
      // 이벤트 안에서 시작을 동기 커밋해 캐시 이동도 완료 갱신에 시작 표시가 합쳐지지 않게 한다.
      flushSync(() => setState(next));
    },
    [],
  );

  const transition = useCallback(
    (callback: () => void | Promise<void>, href?: string) => {
      const destination = href ? new URL(href, window.location.href) : null;
      if (
        destination &&
        (destination.origin !== window.location.origin ||
          routeKey(destination) === routeKey(new URL(window.location.href)))
      ) {
        callback();
        return;
      }
      begin("transition", destination ? routeKey(destination) : "");
      try {
        startTransition(callback);
      } catch (error) {
        finish("cancelled");
        throw error;
      }
    },
    [begin, finish],
  );

  const onCommit = useCallback((key: string) => {
    committed.current = key;
  }, []);

  useEffect(() => {
    const current = active.current;
    if (
      !isPending &&
      current?.kind === "transition" &&
      current.status === "pending"
    ) {
      // 리다이렉트도 실제 다른 목적지 커밋이면 완료다. 무변경/취소는 성공으로 꾸미지 않는다.
      finish(committed.current !== current.origin ? "complete" : "cancelled");
    }
  }, [isPending, finish]);

  useEffect(() => {
    const onPopState = () => {
      const destination = routeKey(new URL(window.location.href));
      if (destination === committed.current) {
        finish("cancelled");
        return;
      }
      // Next의 원래 popstate 복원을 막지 않는다. 같은 URL replace를 루트 전이에 편입해
      // 목적지 오류·취소까지 React 종료 신호로 정리하며 새 방문 기록은 만들지 않는다.
      transition(() => router.replace(window.location.href, { scroll: false }));
    };
    const onPageHide = () => finish("cancelled");
    const onPageShow = () => finish("cancelled");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && active.current?.kind === "document")
        finish("cancelled");
    };
    const onClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      // 모든 핸들러가 끝난 뒤 확인해 GuruLink·사용자 취소와 native 이동을 중복 등록하지 않는다.
      queueMicrotask(() => {
        if (event.defaultPrevented || anchor.hasAttribute("download")) return;
        const target =
          anchor.getAttribute("target") ??
          document.querySelector("base[target]")?.getAttribute("target") ??
          "";
        if (
          target &&
          !["_self", "_top", "_parent"].includes(target.toLowerCase()) &&
          target !== window.name
        )
          return;
        let url: URL;
        try {
          url = new URL(anchor.href);
        } catch {
          return;
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") return;
        if (
          url.origin === location.origin &&
          routeKey(url) === routeKey(new URL(location.href))
        )
          return;
        // 외부 같은 탭 링크도 문서를 교체하므로 pagehide까지 진행 표시를 유지한다.
        begin("document", url.href);
      });
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      queueMicrotask(() => {
        if (event.defaultPrevented) return;
        const submitter = event.submitter;
        const target =
          submitter?.getAttribute("formtarget") ??
          form.getAttribute("target") ??
          document.querySelector("base[target]")?.getAttribute("target") ??
          "";
        const rawMethod = (
          submitter?.getAttribute("formmethod") ?? form.method
        ).toLowerCase();
        // HTML의 누락·잘못된 method 기본값은 GET이고 dialog는 문서 이동이 아니다.
        if (rawMethod === "dialog") return;
        const method = rawMethod === "post" ? "post" : "get";
        if (
          target &&
          !["_self", "_top", "_parent"].includes(target.toLowerCase()) &&
          target !== window.name
        )
          return;
        const action =
          submitter?.getAttribute("formaction") ?? form.getAttribute("action");
        let url: URL;
        try {
          // 빈 action은 현재 문서이며 상대 action은 <base href>를 따른다.
          url = new URL(action || location.href, document.baseURI);
        } catch {
          return;
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") return;
        if (method === "get") {
          // GET은 action의 기존 query를 성공한 폼 필드로 교체한다. submitter 값과 파일명도
          // 포함한 실제 목적지를 비교해야 같은 경로의 검색 이동을 잘못 제외하지 않는다.
          const query = new URLSearchParams();
          const data = new FormData(form, submitter);
          for (const [name, value] of data) {
            query.append(
              name.replace(/\r\n|\r|\n/g, "\r\n"),
              (typeof value === "string" ? value : value.name).replace(
                /\r\n|\r|\n/g,
                "\r\n",
              ),
            );
          }
          url.search = query.toString();
          if (
            url.origin === location.origin &&
            routeKey(url) === routeKey(new URL(location.href))
          )
            return;
        }
        // 같은 URL의 POST도 서버 처리 후 새 문서를 받으므로 GET의 제외 조건을 쓰지 않는다.
        if (!event.defaultPrevented) begin("document", url.href);
      });
    };
    // Navigation API가 없는 브라우저는 pageshow(뒤로 복원)와 Escape 취소를 사용한다.
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    const onNavigationError = () => {
      if (active.current?.kind === "document") finish("cancelled");
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    navigation?.addEventListener("navigateerror", onNavigationError);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      navigation?.removeEventListener("navigateerror", onNavigationError);
    };
  }, [begin, finish, router, transition]);

  const controller = useMemo(() => ({ transition }), [transition]);
  return (
    <NavigationControllerContext value={controller}>
      {children}
      <Suspense fallback={null}>
        <NavigationCommitObserver onCommit={onCommit} />
      </Suspense>
      <NavigationProgressIndicator state={state} />
    </NavigationControllerContext>
  );
}
