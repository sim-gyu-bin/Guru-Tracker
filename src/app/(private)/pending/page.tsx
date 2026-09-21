import { notFound, redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ACCESS_STATUS_NOTICES,
  ACCESS_UNRESOLVED_NOTICES,
} from "@/domain/access";
import { accessState } from "@/server/access";

// 승인 상태는 매 요청마다 DB에서 다시 읽는다. 접근 해제는 다음 요청부터 곧바로 적용된다.
export const dynamic = "force-dynamic";

/**
 * 로그인한 미승인 사용자의 상태 안내 화면.
 *
 * 승인 전에는 공시 자료에 접근할 수 없다는 사실과, 접근 해제된 계정은 다시 요청할 수 없다는
 * 사실만 안내한다. 여기서 가입 요청을 만들지 않으며 공시 데이터도 읽지 않는다.
 */
export default async function PendingPage() {
  const state = await accessState();
  if (state.kind === "anonymous" || state.kind === "unverified") {
    notFound();
  }

  const notice =
    state.kind === "member"
      ? state.row.status === "approved"
        ? null
        : ACCESS_STATUS_NOTICES[state.row.status]
      : ACCESS_UNRESOLVED_NOTICES[state.reason];
  if (notice === null) redirect("/main");

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-[400px] rounded-xl border border-border bg-card p-6">
        <h1 className="text-lg font-semibold tracking-[-0.01em]">
          Guru Tracker
        </h1>
        <p className="mt-2 text-[13px] leading-[20px] text-muted-foreground">
          공시 화면은 관리자 승인 후에 열립니다.
        </p>

        <Alert className="mt-5">
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription className="text-[13px] leading-[19px]">
            {notice.body}
          </AlertDescription>
        </Alert>

        {state.kind === "member" ? (
          <dl className="mt-5 grid gap-1 border-t border-border pt-4 text-[12px]">
            <dt className="text-muted-foreground">요청 계정</dt>
            <dd className="break-all font-medium">{state.row.email}</dd>
          </dl>
        ) : null}

        <form action="/auth/signout" className="mt-5" method="post">
          <Button className="w-full" size="lg" type="submit" variant="outline">
            로그아웃
          </Button>
        </form>
      </section>
    </main>
  );
}
