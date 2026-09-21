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
 * 제공하는 인증은 Google OAuth 하나뿐이라 로그인과 회원가입이 같은 `/auth/signin` GET으로 들어간다.
 * 가입은 최초 로그인 시 승인 요청으로만 남고 자동 승인은 없다. 이 화면은 진입만 담당하며 승인 판정은
 * 콜백·Proxy·각 화면이 같은 규칙으로 다시 확인한다. 로그인 후 돌아갈 경로는 내부 경로 규칙을 통과한
 * 값만 두 버튼에 실어 보낸다.
 *
 * 화면에는 서비스명, 두 인증 버튼, 승인 안내 한 줄, 정책 링크만 둔다. 가입 여부나 승인
 * 여부를 미리 알 수 없는 화면이므로 신뢰를 암시하는 표식이나 소개 문구를 넣지 않는다.
 * 색은 globals.css의 공통 토큰만 쓰고, 배경 장식광은 토큰 값을 참조하는 정적 그라디언트 하나뿐이다.
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
    <main className="relative isolate flex min-h-dvh flex-col bg-background px-4 py-5 sm:py-6">
      {/*
        테마별 장식광. 색과 세기는 globals.css의 --glow-* 토큰이 정하므로 라이트·다크가 같은 마크업을 쓴다.
        움직이지 않고, `isolate`로 만든 겹침 문맥 안에서 음수 z로 내려 카드 뒤에만 깔린다.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_45%_at_15%_0%,var(--glow-blue),transparent_70%),radial-gradient(65%_45%_at_88%_100%,var(--glow-green),transparent_72%)]"
      />

      <div className="mx-auto flex w-full max-w-[400px] flex-1 items-center py-8">
        <section className="w-full rounded-xl border border-glass-border bg-glass p-6 backdrop-blur-[20px]">
          <h1 className="font-sans text-2xl leading-8 font-semibold tracking-[-0.02em]">
            Guru Tracker
          </h1>

          {notice ? (
            <Alert className="mt-5" variant={error ? "destructive" : "default"}>
              <AlertTitle>{notice.title}</AlertTitle>
              <AlertDescription className="text-[13px] leading-[19px]">
                {notice.body}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-6 space-y-2">
            <form action="/auth/signin" method="get">
              {next ? <input name="next" type="hidden" value={next} /> : null}
              <Button className="w-full min-h-11" size="lg" type="submit">
                Google로 로그인
              </Button>
            </form>
            <form action="/auth/signin" method="get">
              {next ? <input name="next" type="hidden" value={next} /> : null}
              <Button
                className="w-full min-h-11"
                size="lg"
                type="submit"
                variant="outline"
              >
                Google로 회원가입
              </Button>
            </form>
            <p className="pt-1 text-center text-xs leading-5 text-muted-foreground">
              가입 후 관리자 승인이 필요합니다.
            </p>
          </div>

          {state.kind === "anonymous" ? null : (
            <form
              action="/auth/signout"
              className="mt-5 border-t border-border pt-4"
              method="post"
            >
              <Button
                className="w-full min-h-11"
                size="lg"
                type="submit"
                variant="ghost"
              >
                로그아웃
              </Button>
            </form>
          )}

          <nav
            aria-label="서비스 정책"
            className="mt-4 flex flex-wrap justify-center gap-x-4 text-xs text-muted-foreground"
          >
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
      </div>
    </main>
  );
}
