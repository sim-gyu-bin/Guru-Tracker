// biome-ignore-all lint/style/noDefaultExport: Next.js 프록시 진입점은 기본 내보내기로만 등록된다.
import { type NextRequest, NextResponse } from "next/server";

import {
  isAdminRow,
  type RouteFacts,
  routeFor,
  verifiedGoogleIdentity,
} from "./domain/access";
import { lookupAccessRow } from "./server/access-store";
import {
  createSessionClient,
  identityInputOf,
  type SessionClient,
} from "./server/supabase";

/**
 * 화면 접근 판정과 세션 쿠키 갱신을 한 곳에서 처리한다.
 *
 * 페이지마다 같은 판정을 반복하면 규칙이 갈라지므로, 경로별 목적지는 도메인의 `routeFor`가 정하고
 * 이 파일은 세션·승인 사실을 채워 404 또는 리다이렉트를 만든다. 가입 요청을 만들지 않고 읽기만 하므로
 * 승인되지 않은 방문이 DB 상태를 바꾸지 않는다. API 경로는 각 라우트가 직접 판정한다.
 */
export const config = {
  // 정적 자원·API·OAuth 실행 경로는 제외한다. API는 라우트에서 상태 코드로 거절해야 캐시
  // 클라이언트가 오해하지 않고, /auth/*는 미로그인 상태로 실행되어야 하므로 세션 판정 대신
  // 각 라우트가 스스로 검증한다(PKCE 코드 교환, Origin 확인). 경로 규칙의 근거는
  // 도메인의 `isAuthExecutionPath`에 있고, 이 제외는 같은 사실을 왕복 없이 적용하는 최적화다.
  matcher: [
    "/((?!api/|auth/|_next/|icon.svg|favicon.ico|robots.txt|sitemap.xml|manifest\\.webmanifest).*)",
  ],
};

/** 세션과 승인 표에서 판정에 필요한 사실만 모은다. 확인 실패는 승인으로 해석하지 않는다. */
async function routeFacts(client: SessionClient | null): Promise<RouteFacts> {
  const anonymous: RouteFacts = {
    signedIn: false,
    verified: false,
    resolved: false,
    status: null,
    admin: false,
  };
  if (!client) return anonymous;
  const { data, error } = await client.auth.getUser();
  const user = error ? null : data.user;
  const identity = user ? verifiedGoogleIdentity(identityInputOf(user)) : null;
  if (!identity) return anonymous;
  const lookup = await lookupAccessRow(identity.userId);
  if (lookup.kind !== "row") {
    // 세션은 있으나 승인 상태를 확인하지 못했다. 미승인과 같은 경로로 보내되 승인으로 넘기지 않는다.
    return { ...anonymous, signedIn: true, verified: true };
  }
  return {
    signedIn: true,
    verified: true,
    resolved: true,
    status: lookup.row.status,
    admin: isAdminRow(lookup.row),
  };
}

export default async function proxy(
  request: NextRequest,
): Promise<NextResponse> {
  // 세션 토큰 갱신은 여기서만 일어난다. 어느 응답으로 나가든 갱신된 쿠키를 함께 실어 보내야
  // 다음 요청이 만료된 토큰으로 시작하지 않는다.
  let forwarded: NextResponse | null = null;
  const forward = (): NextResponse => {
    forwarded ??= NextResponse.next({ request });
    return forwarded;
  };
  const client = createSessionClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookies, headers) => {
      for (const { name, value } of cookies) request.cookies.set(name, value);
      const response = forward();
      for (const { name, value, options } of cookies) {
        response.cookies.set(name, value, options);
      }
      // 세션 쿠키를 담은 응답은 CDN·프록시에 캐시되면 안 된다.
      for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
      }
    },
  });

  const decision = routeFor(request.nextUrl.pathname, await routeFacts(client));
  if (decision === "self") return forward();

  // 클로저 안에서만 대입되는 변수는 흐름 분석이 좁혀 버리므로 명시 타입으로 다시 읽는다.
  const applied = (): NextResponse | null => forwarded;

  // 렌더링의 스트리밍 여부와 무관하게 미인증 요청은 실제 HTTP 404로 종료한다.
  const target = new URL(
    decision === "not-found"
      ? "/_not-found"
      : decision === "pending"
        ? "/pending"
        : "/main",
    request.url,
  );
  const redirect =
    decision === "not-found"
      ? NextResponse.rewrite(target, { status: 404 })
      : NextResponse.redirect(target);
  redirect.headers.set("Cache-Control", "private, no-store");
  for (const cookie of applied()?.cookies.getAll() ?? []) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
