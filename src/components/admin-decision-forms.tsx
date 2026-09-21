"use client";

import {
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useRef,
  useTransition,
} from "react";

import { useNavigationController } from "@/components/navigation-provider";

type DecisionAction = (data: FormData) => Promise<void>;
type SubmitDecision = (
  event: FormEvent<HTMLFormElement>,
  action: DecisionAction,
) => void;
const DecisionContext = createContext<SubmitDecision | null>(null);

/** 관리자 화면 전체에서 하나의 결정만 전송한다. 서버의 revision 검사는 별도로 유지한다. */
export function AdminDecisionBoundary({ children }: { children: ReactNode }) {
  const locked = useRef(false);
  const [pending, startTransition] = useTransition();
  const { transition } = useNavigationController();

  const submit: SubmitDecision = (event, action) => {
    event.preventDefault();
    // React가 disabled를 반영하기 전의 연속 클릭·Enter 제출도 같은 잠금으로 막는다.
    if (locked.current) return;
    const data = new FormData(event.currentTarget);
    locked.current = true;
    // 로컬 잠금과 루트 전이를 함께 유지해 서버 redirect 후 화면 커밋까지 공통 표시가 살아 있다.
    transition(() => {
      startTransition(async () => {
        try {
          await action(data);
        } finally {
          locked.current = false;
        }
      });
    });
  };

  return (
    <DecisionContext.Provider value={submit}>
      <p
        aria-live="polite"
        className="text-[13px] text-muted-foreground"
        role="status"
      >
        {pending ? "결정을 처리하고 있습니다…" : null}
      </p>
      <fieldset
        aria-busy={pending}
        className="min-w-0"
        disabled={pending}
        inert={pending}
      >
        {children}
      </fieldset>
    </DecisionContext.Provider>
  );
}

/** 행·확인 패널의 폼을 공통 잠금에 연결한다. JS 로딩 전에는 기본 서버 액션 제출을 유지한다. */
export function AdminDecisionForm({
  action,
  children,
  className,
}: {
  action: DecisionAction;
  children: ReactNode;
  className?: string;
}) {
  const submit = useContext(DecisionContext);
  if (!submit)
    throw new Error("관리자 결정 폼에는 공통 제출 경계가 필요합니다.");
  return (
    <form
      action={action}
      className={className}
      onSubmit={(event) => submit(event, action)}
    >
      {children}
    </form>
  );
}
