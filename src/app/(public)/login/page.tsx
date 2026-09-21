import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ACCESS_UNRESOLVED_NOTICES,
  LOGOUT_RESULT_NOTICES,
  type LogoutResultCode,
  OAUTH_ERROR_NOTICES,
  type OauthErrorCode,
  parseLogoutResult,
  parseOauthError,
  safeInternalPath,
} from "@/domain/access";
import { accessState } from "@/server/access";

// 접근 판정은 매 요청마다 다시 한다. 로그인 상태가 정적으로 굳은 화면을 만들지 않는다.
export const dynamic = "force-dynamic";

type LoginPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

/**
 * 공개 로그인 화면.
 *
 * 제공하는 인증은 Google OAuth 하나뿐이고 가입은 최초 로그인 시 요청으로만 남는다(자동 승인 없음).
 * 이 화면은 안내만 하며 승인 판정은 콜백·Proxy·각 화면이 같은 규칙으로 다시 확인한다.
 * 로그인 후 돌아갈 경로는 내부 경로 규칙을 통과한 값만 Google 버튼에 실어 보낸다.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const state = await accessState();
  if (state.kind === "member") {
    redirect(state.row.status === "approved" ? "/main" : "/pending");
  }

  const error: OauthErrorCode | null = parseOauthError(params.error);
  const logout: LogoutResultCode | null = parseLogoutResult(params.logout);
  // 문구는 한 번에 하나만 보여 준다. 로그인 실패(`error`)가 있으면 그 원인을 먼저 알리고,
  // 로그아웃 결과는 라우트가 직접 붙인 값이라 같은 화면에 겹쳐 보여 줄 이유가 없다.
  const notice =
    error !== null
      ? {
          title: "Google 로그인을 완료하지 못했습니다",
          body: OAUTH_ERROR_NOTICES[error],
        }
      : logout !== null
        ? LOGOUT_RESULT_NOTICES[logout]
        : state.kind === "unresolved"
          ? ACCESS_UNRESOLVED_NOTICES[state.reason]
          : state.kind === "unverified"
            ? {
                title: "확인된 Google 계정이 아닙니다",
                body: OAUTH_ERROR_NOTICES.unverified,
              }
            : null;
  // 로그아웃 뒤 다시 로그인해도 원래 보던 화면으로 돌아갈 수 있게 경로를 이어 준다.
  const next = safeInternalPath(params.next) ?? "";

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-[400px] rounded-xl border border-border bg-card p-6">
        <span
          className="grid size-7 place-items-center rounded-md bg-foreground text-[11px] tracking-[-0.08em] text-primary-foreground"
          aria-hidden="true"
        >
          GT
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-[-0.01em]">
          Guru Tracker
        </h1>
        <p className="mt-2 text-[13px] leading-[20px] text-muted-foreground">
          미국 공시 원문으로 확인한 투자자의 보유·거래를 보는 작업 화면입니다.
          승인된 사용자만 열 수 있습니다.
        </p>

        {notice ? (
          <Alert className="mt-5" variant={error ? "destructive" : "default"}>
            <AlertTitle>{notice.title}</AlertTitle>
            <AlertDescription className="text-[13px] leading-[19px]">
              {notice.body}
            </AlertDescription>
          </Alert>
        ) : null}

        <form action="/auth/signin" className="mt-5" method="get">
          {next ? <input name="next" type="hidden" value={next} /> : null}
          <Button className="w-full" size="lg" type="submit">
            Google로 계속
          </Button>
        </form>

        {state.kind === "anonymous" ? null : (
          <form action="/auth/signout" className="mt-2" method="post">
            <Button
              className="w-full"
              size="lg"
              type="submit"
              variant="outline"
            >
              로그아웃
            </Button>
          </form>
        )}

        <p className="mt-5 border-t border-border pt-4 text-[11px] leading-[17px] text-muted-foreground">
          최초 로그인은 관리자 승인 요청으로 접수되며, 승인 전에는 공시 화면을
          열 수 없습니다. 같은 이메일이라도 기존 계정과 자동으로 합쳐지지
          않습니다.
        </p>
        <nav
          aria-label="서비스 정책"
          className="mt-3 flex flex-wrap gap-x-4 text-xs text-muted-foreground"
        >
          <Link
            href="/"
            className="inline-flex min-h-11 items-center hover:underline"
          >
            서비스 소개
          </Link>
          <Link
            href="/privacy"
            className="inline-flex min-h-11 items-center hover:underline"
          >
            개인정보처리방침
          </Link>
          <Link
            href="/terms"
            className="inline-flex min-h-11 items-center hover:underline"
          >
            이용약관
          </Link>
        </nav>
      </section>
    </main>
  );
}
