import { type NextRequest, NextResponse } from "next/server";

import { isSameOriginRequest, sameSiteRedirect } from "@/server/origin";
import {
  applySessionCookies,
  clearNextPathCookie,
  expireSessionCookies,
  hasSessionCookie,
  type PendingCookie,
} from "@/server/session";
import {
  createSessionClient,
  type SessionCookieBridge,
} from "@/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 로그아웃. Auth 서버에서 세션을 폐기하고 브라우저의 세션 쿠키를 지운 뒤 로그인 화면으로 돌려보낸다.
 *
 * 링크나 다른 사이트의 폼으로 로그아웃되지 않게 `isSameOriginRequest`로 출처를 먼저 확인한다.
 *
 * Auth 서버 signOut이 실패하면 SDK는 로컬 세션 정리를 하지 않는다. 그대로 두면 브라우저에 세션이
 * 남아 다음 요청이 다시 로그인 상태가 되는데, 이는 사용자가 본 로그아웃과 실제 세션이 어긋나는
 * 상태다. 그래서 signOut 성공 여부와 무관하게 이 프로젝트의 세션 쿠키를 응답에서 만료시켜
 * 로그아웃을 실제로 보장한다. 서버 폐기까지 확인한 경우와 확인하지 못한 경우의 차이는 로그인 화면
 * 문구(`?logout=unconfirmed`)로만 알린다.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(request.headers)) {
    return NextResponse.json(
      { status: "failed", error: "같은 사이트에서만 로그아웃할 수 있습니다." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  // 실패 문구를 정하려면 signOut 전에 지울 세션이 있었는지 먼저 본다.
  const hadSession = hasSessionCookie(request);
  const issued: PendingCookie[] = [];
  const bridge: SessionCookieBridge = {
    getAll: () => request.cookies.getAll(),
    setAll: (cookies) => {
      issued.push(...cookies);
    },
  };
  const client = createSessionClient(bridge);
  let revokeFailed = false;
  if (client) {
    try {
      const { error } = await client.auth.signOut();
      revokeFailed = error !== null;
    } catch {
      // 예외도 폐기 실패로 본다. 쿠키 만료와 리디렉션은 그대로 진행한다.
      revokeFailed = true;
    }
  }

  // 지울 세션이 없던 요청은 폐기 실패를 알릴 대상이 없다.
  const target =
    revokeFailed && hadSession ? "/login?logout=unconfirmed" : "/login";
  // POST 뒤에는 GET으로 바꿔 303으로 보낸다. 상대 Location이라 프록시·도메인 구성과 무관하다.
  const response = sameSiteRedirect(target, 303);
  // signOut이 남긴 쿠키를 먼저 적용하고, 그 위에서 세션 쿠키를 만료시킨다. 순서가 바뀌면
  // 실패한 signOut이 내보낸 갱신 토큰이 마지막 Set-Cookie가 되어 세션이 되살아난다.
  applySessionCookies(response, issued);
  await expireSessionCookies(request, response);
  clearNextPathCookie(response);
  return response;
}
