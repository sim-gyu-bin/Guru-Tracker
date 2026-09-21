import { type NextRequest, NextResponse } from "next/server";

import { safeInternalPath } from "@/domain/access";
import { callbackUrl } from "@/server/config";
import { sameSiteRedirect } from "@/server/origin";
import {
  applySessionCookies,
  nextPathCookie,
  type PendingCookie,
} from "@/server/session";
import { createSessionClient } from "@/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OAuth 시작 실패는 문구 코드만 남긴다. 원인 문자열은 화면에 노출하지 않는다. */
function failed(code: string): NextResponse {
  return sameSiteRedirect(`/login?error=${code}`, 307);
}

/**
 * Google OAuth를 시작한다.
 *
 * 운영 리디렉션 주소는 서버 설정으로만 만들고, 개발 중에는 루프백 요청 주소도 허용한다.
 * 내부 복귀 경로는 규칙을 통과한 값만 쿠키로 실어 콜백까지 나른다. PKCE 검증 값도 같은 응답의 쿠키로
 * 나가야 하므로 bridge로 모아 응답에 그대로 싣는다.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const redirectTo = callbackUrl("/auth/callback", request.url);
  if (!redirectTo) return failed("unconfigured");

  const issued: PendingCookie[] = [];
  const client = createSessionClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookies) => {
      issued.push(...cookies);
    },
  });
  if (!client) return failed("unconfigured");

  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      // 같은 브라우저에 여러 Google 계정이 있을 때 관리자 계정을 고를 수 있게 한다.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) return failed("start");

  const response = NextResponse.redirect(data.url);
  response.headers.set("Cache-Control", "no-store");
  applySessionCookies(response, issued);
  const next = nextPathCookie(
    safeInternalPath(request.nextUrl.searchParams.get("next")) ?? "",
    request.nextUrl.protocol === "https:",
  );
  response.cookies.set(next.name, next.value, next.options);
  return response;
}
