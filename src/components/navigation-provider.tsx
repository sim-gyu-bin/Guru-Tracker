"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

// 이동 중 표시를 늦춰 보여 주는 시간(ms)이다.
// 실제 이동은 이 값과 무관하게 즉시 시작하며, 짧게 끝나는 이동의 표시 깜빡임만 억제한다.
const NAVIGATION_INDICATOR_DELAY_MS = 120;

// 프로그램 이동(useGuruRouter)의 진행 표시가 소유하는 고정 id다. 관찰자 id와 충돌하지 않는다.
const PROGRAMMATIC_NAVIGATION_ID = "guru-router";

/**
 * 진행 중 표시의 소유자 집합과 프로그램 이동 전이를 공유하는 내부 controller다.
 * 이동 표시 상태의 단일 출처는 이 controller 하나이며, 개별 링크 상태를 들고 있지 않는다.
 */
type NavigationController = {
  /** 진행 중 표시를 id 소유로 등록하고, 그 소유분만 해제하는 함수를 반환한다. */
  register(id: string): () => void;
  /** 프로그램 이동을 Provider의 단일 전이로 실행한다. */
  transition(callback: () => void): void;
};

const NavigationControllerContext = createContext<NavigationController | null>(
  null,
);

/** 표시 지연을 적용하지 않은 원시 진행 상태다. 지연 판단은 진행 표시 컴포넌트가 맡는다. */
const NavigationPendingContext = createContext(false);

/**
 * 내부 공유 훅이다. GuruLink의 pending 관찰자와 useGuruRouter가 같은 controller를 읽는다.
 * 화면 모듈에서 직접 쓰지 않고, 이동 상태를 소유한 이 모듈의 훅을 통해서만 쓴다.
 * Provider 밖에서 호출하면 등록할 controller가 없으므로 오류로 알린다.
 */
export function useNavigationController(): NavigationController {
  const controller = useContext(NavigationControllerContext);

  if (!controller) {
    throw new Error(
      "이동 상태 훅은 NavigationProvider 안에서만 사용할 수 있습니다.",
    );
  }

  return controller;
}

/**
 * 링크 하나의 pending을 자기 id로 등록하는 내부 훅이다.
 * pending이 true인 동안만 등록하며, 다른 소유자의 해제나 unmount가 진행 중 표시를 끄지 않는다.
 * 입력: 소유자 id와 그 소유자의 pending 여부. 반환: 없음.
 */
export function usePendingNavigationRegistration(
  id: string,
  pending: boolean,
): void {
  const { register } = useNavigationController();

  useEffect(() => {
    if (!pending) {
      return;
    }

    return register(id);
  }, [id, pending, register]);
}

/**
 * 화면을 가리지 않는 상단 2px 진행 표시다.
 * 실제 전송량이 아닌 대기 연출이며, 94%에 점차 접근하다 이동 완료 시에만 100%를 채운다.
 * 짧은 이동은 숨기고 완료 후 페이드아웃한다. 새 이동과 unmount는 이전 타이머를 취소한다.
 * motion-reduce에서는 길이·투명도 보간을 생략하며 aria-live는 실제 pending 동안만 알린다.
 */
function NavigationProgressIndicator() {
  const pending = useContext(NavigationPendingContext);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  useEffect(() => {
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    let advanceTimer: ReturnType<typeof setInterval> | undefined;

    const updateProgress = (value: number) => {
      progressRef.current = value;
      setProgress(value);
    };

    if (pending) {
      // 완료 연출 도중 새 이동이 시작되면 이전 완료 타이머 대신 새 주기를 시작한다.
      if (progressRef.current >= 1) {
        setVisible(false);
        updateProgress(0);
      }

      startTimer = setTimeout(() => {
        updateProgress(Math.max(progressRef.current, 0.08));
        setVisible(true);
        advanceTimer = setInterval(() => {
          updateProgress(
            progressRef.current + (0.94 - progressRef.current) * 0.14,
          );
        }, 400);
      }, NAVIGATION_INDICATOR_DELAY_MS);
    } else if (progressRef.current > 0) {
      updateProgress(1);
      hideTimer = setTimeout(() => setVisible(false), 300);
      // 페이드아웃이 끝난 뒤 길이를 초기화해 바가 뒤로 줄어드는 모습을 숨긴다.
      resetTimer = setTimeout(() => updateProgress(0), 500);
    }

    return () => {
      clearTimeout(startTimer);
      clearTimeout(hideTimer);
      clearTimeout(resetTimer);
      clearInterval(advanceTimer);
    };
  }, [pending]);

  return (
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 transition-opacity duration-150 motion-reduce:transition-none ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className="h-full origin-left bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <span aria-live="polite" className="sr-only">
        {pending && visible ? "페이지 이동 중" : ""}
      </span>
    </>
  );
}

/**
 * 루트 레이아웃에서 children을 감싸 이동 중 표시 상태를 한곳에서 관리하는 클라이언트 공급자다.
 * 서버 컴포넌트인 children은 그대로 전달되며, 이 공급자가 상태를 바꿔도 페이지 트리는 다시 렌더링되지 않는다.
 * 입력: 화면 트리(children). 출력: children과 상단 진행 표시. 실패 조건: 없음(Provider 밖 훅 호출은 오류).
 */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const pendingIdsRef = useRef(new Set<string>());
  const [pending, setPending] = useState(false);
  // push·replace·back·forward를 감싸는 중앙 전이다. 링크 클릭은 Next Link의 pending이 담당한다.
  const [isPending, startTransition] = useTransition();

  /** 소유자 집합이 바뀔 때만 표시 상태를 갱신한다. 같은 값이면 React가 다시 렌더링하지 않는다. */
  const syncPending = useCallback(() => {
    setPending(pendingIdsRef.current.size > 0);
  }, []);

  const register = useCallback(
    (id: string) => {
      pendingIdsRef.current.add(id);
      syncPending();

      return () => {
        pendingIdsRef.current.delete(id);
        syncPending();
      };
    },
    [syncPending],
  );

  const transition = useCallback(
    (callback: () => void) => {
      startTransition(callback);
    },
    [startTransition],
  );

  // 전이 진행 중에도 실제 데이터가 커밋되기 전에는 진행 표시를 유지한다.
  useEffect(() => {
    if (!isPending) {
      return;
    }

    return register(PROGRAMMATIC_NAVIGATION_ID);
  }, [isPending, register]);

  const controller = useMemo(
    () => ({ register, transition }),
    [register, transition],
  );

  return (
    <NavigationControllerContext value={controller}>
      <NavigationPendingContext value={pending}>
        {children}
        <NavigationProgressIndicator />
      </NavigationPendingContext>
    </NavigationControllerContext>
  );
}
