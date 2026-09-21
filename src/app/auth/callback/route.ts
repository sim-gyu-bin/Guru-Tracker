import { type NextRequest, NextResponse } from "next/server";

import {
  type OauthErrorCode,
  safeInternalPath,
  verifiedGoogleIdentity,
} from "@/domain/access";
import { provisionIdentity } from "@/server/access";
import { callbackUrl } from "@/server/config";
import { sameSiteRedirect } from "@/server/origin";
import {
  applySessionCookies,
  clearNextPathCookie,
  OAUTH_NEXT_COOKIE,
  type PendingCookie,
} from "@/server/session";
import { createSessionClient, identityInputOf } from "@/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 로그인 실패는 문구 코드만 남기고 세션 쿠키를 만들지 않는다.
 * 이어 갈 내부 경로와 복귀 쿠키는 지워 다음 시도로 남지 않게 한다.
 */
function failed(code: OauthErrorCode, next: string): NextResponse {
  const params = new URLSearchParams({ error: code });
  if (next) params.set("next", next);
  const response = sameSiteRedirect(`/login?${params}`, 307);
  clearNextPathCookie(response);
  return response;
}

/**
 * Google OAuth 콜백. 세션 쿠키를 만드는 유일한 경로다.
 *
 * 쿼리의 code를 서버에서 교환하고, Auth가 provider로 확인한 Google 신원만 세션으로 인정한다.
 * 신원이 확인되면 DB에 가입 요청을 접수하며(승인은 관리자 몫) 결과와 무관하게 이어 갈 화면으로
 * 되돌린다. 진행 중 실패는 원인을 세분화하지 않고 로그인 화면 문구로만 알린다.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const redirectTo = callbackUrl("/auth/callback", request.url);
  if (!redirectTo) return failed("unconfigured", "");

  const next =
    safeInternalPath(request.cookies.get(OAUTH_NEXT_COOKIE)?.value) ?? "";
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (!code) {
    // Google이 돌려준 error 파라미터는 거부·실패를 구분할 뿐 내용을 화면에 옮기지 않는다.
    return failed(params.get("error") ? "oauth_denied" : "missing_code", next);
  }

  const issued: PendingCookie[] = [];
  const client = createSessionClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookies) => {
      issued.push(...cookies);
    },
  });
  if (!client) return failed("unconfigured", next);

  const exchanged = await client.auth.exchangeCodeForSession(code);
  if (exchanged.error || !exchanged.data.user) {
    return failed("exchange", next);
  }
  const identity = verifiedGoogleIdentity(identityInputOf(exchanged.data.user));
  if (!identity) return failed("unverified", next);

  // 요청 접수·관리자 지정 판정은 DB 함수가 하고, 그 결과와 무관하게 세션은 유지한다.
  // 승인되지 않은 계정은 화면 판정이 다시 확인하므로 다음 경로를 정하는 데 쓰지 않는다.
  await provisionIdentity(identity);

  // 이어 갈 경로가 없으면 홈으로 보낸다. 승인되지 않았거나 확인할 수 없으면 Proxy와 화면이
  // 로그인·대기 화면으로 돌려보내므로 승인 여부를 여기서 판단하지 않는다.
  const response = sameSiteRedirect(next || "/main", 307);
  applySessionCookies(response, issued);
  clearNextPathCookie(response);
  return response;
}
