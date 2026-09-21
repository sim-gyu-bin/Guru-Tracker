import "server-only";

import {
  type CookieOptions,
  clearAuthCookiesAtScopes,
  isChunkLike,
} from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { verifiedGoogleIdentity } from "../domain/access";
import {
  createSessionClient,
  identityInputOf,
  publicConfig,
  type SessionClient,
  type SessionCookieBridge,
} from "./supabase";

/**
 * 요청 쿠키의 세션을 Auth에 확인한다.
 *
 * 쿠키 안의 토큰만 믿지 않고 Auth 서버에 검증을 요청하며, provider가 확인한 Google 신원이
 * 아니면 세션으로 인정하지 않는다.
 */
export type SessionState =
  | { kind: "identity"; userId: string; email: string }
  | { kind: "anonymous" }
  | { kind: "unverified" }
  | { kind: "unconfigured" };

/**
 * 요청 쿠키 저장소(`next/headers`)를 쓰는 세션 클라이언트.
 *
 * 서버 컴포넌트 렌더에서는 쿠키를 쓸 수 없어 갱신된 토큰이 버려진다. 갱신 결과를 응답에 실어야 하는
 * 서버 액션·라우트 핸들러는 자체 응답에 묶은 bridge를 만들어 이 함수 대신 `createSessionClient`를 쓴다.
 */
export async function cookieSessionClient(): Promise<SessionClient | null> {
  if (!publicConfig()) return null;
  const store = await cookies();
  return createSessionClient({
    getAll: () => store.getAll(),
    setAll: (items) => {
      try {
        for (const item of items)
          store.set(item.name, item.value, item.options);
      } catch {
        // 읽기 전용 렌더. 세션 판정 결과에는 영향이 없다.
      }
    },
  });
}

export async function sessionState(): Promise<SessionState> {
  const client = await cookieSessionClient();
  if (!client) return { kind: "unconfigured" };
  const { data, error } = await client.auth.getUser();
  // Auth 서버에 닿지 못한 경우도 익명으로 축약한다. 확인되지 않은 세션을 승인으로 쓰지 않는다.
  if (error || !data.user) return { kind: "anonymous" };
  const identity = verifiedGoogleIdentity(identityInputOf(data.user));
  if (!identity) return { kind: "unverified" };
  return { kind: "identity", userId: identity.userId, email: identity.email };
}

/** 서버 액션·라우트 핸들러에서 넘겨받은 bridge를 그대로 쓰는 세션 클라이언트. */
export function bridgedSessionClient(bridge: SessionCookieBridge) {
  return publicConfig() ? createSessionClient(bridge) : null;
}

/**
 * OAuth를 시작한 화면의 복귀 경로를 콜백까지 나르는 쿠키 이름이다.
 *
 * 콜백 주소는 Google이 정하므로 복귀 경로를 쿼리에 실어 보내면 외부 입력이 된다. 쿼리로 되돌아온
 * 주소(승인 후에는 관리자 화면)를 다시 열기 위한 값이므로 쿠키로만 나르고 결과와 함께 지운다.
 */
export const OAUTH_NEXT_COOKIE = "gt-oauth-next";

/** 라우트가 자기 응답에 그대로 실어야 하는 세션 쿠키 한 건. bridge가 넘겨주는 모양 그대로다. */
export type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

/** 세션 쿠키를 응답에 복사한다. 값은 해석하지 않고 이름·값·속성만 옮긴다. */
export function applySessionCookies(
  response: NextResponse,
  cookies: readonly PendingCookie[],
): void {
  for (const cookie of cookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
}

/**
 * 복귀 경로 쿠키를 만든다. 값은 이미 내부 경로 규칙을 통과한 값이거나 빈 문자열이다.
 * 세션 쿠키와 같이 httpOnly·SameSite=Lax로 두어 스크립트와 교차 사이트 전송에서 빼낼 수 없게 한다.
 */
export function nextPathCookie(path: string, secure: boolean): PendingCookie {
  return {
    name: OAUTH_NEXT_COOKIE,
    value: path,
    options: {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
      ...(secure ? { secure: true } : {}),
    },
  };
}

/** 복귀 경로 쿠키를 지운다. 다음 로그인 시도로 이전 값이 남지 않게 한다. */
export function clearNextPathCookie(response: NextResponse): void {
  response.cookies.set(OAUTH_NEXT_COOKIE, "", { path: "/", maxAge: 0 });
}

/**
 * 이 프로젝트 세션 쿠키의 저장 키. `@supabase/supabase-js`가 공개 주소의 첫 호스트 라벨로 만드는
 * 이름과 같은 규칙(`sb-<label>-auth-token`)이다. 설정이 없거나 주소가 깨졌으면 null이다.
 */
function sessionCookieKey(): string | null {
  const settings = publicConfig();
  if (!settings) return null;
  try {
    return `sb-${new URL(settings.url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}

/**
 * 요청에 이 프로젝트의 세션 쿠키가 실려 있는지. 로그아웃 결과 문구를 정할 때만 쓴다.
 * 저장 키를 알 수 없으면(설정 누락) false를 돌려주고 추측으로 쿠키를 지우지 않는다.
 */
export function hasSessionCookie(request: NextRequest): boolean {
  const key = sessionCookieKey();
  if (!key) return false;
  // 청크로 나뉜 세션(`<key>.0`)은 이름 뒤 형식까지 SDK 판정 함수에 맡긴다.
  return request.cookies
    .getAll()
    .some((cookie) => isChunkLike(cookie.name, key));
}

/**
 * 응답에서 이 프로젝트의 세션 쿠키를 만료시킨다.
 *
 * Auth 서버 `signOut`이 실패하면 SDK는 로컬 정리를 하지 않고 지우지 못한 쿠키를 알려 준다. 그대로
 * 두면 브라우저에 세션이 남아 다음 요청이 다시 로그인 상태가 되어, 사용자가 본 로그아웃과 실제
 * 세션이 어긋난다. 그래서 signOut 성공 여부와 무관하게 저장 키에 속한 세션 청크(분할된 조각 포함)를
 * 만료시켜 로그아웃을 실제로 보장한다. 같은 출처의 다른 쿠키는 건드리지 않는다.
 *
 * 만료 쿠키는 SDK 헬퍼로 만든다. 저장 키와 경로·도메인 규칙이 SDK와 어긋나지 않게 하기 위해서다.
 * 세션 쿠키 자체가 없던 요청에서는 아무것도 하지 않는다.
 */
export async function expireSessionCookies(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  const key = sessionCookieKey();
  if (!key) return;
  const issued: PendingCookie[] = [];
  await clearAuthCookiesAtScopes({
    getAll: () => request.cookies.getAll(),
    setAll: (items) => {
      issued.push(...items);
    },
    storageKey: key,
    scopes: [{}],
  });
  applySessionCookies(response, issued);
}
