import "server-only";

import type { CookieMethodsServer } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { GoogleIdentityInput } from "../domain/access";

/**
 * Supabase 접근 설정과 PostgREST 호출을 모은다.
 *
 * publishable 키는 브라우저에도 공개되는 값이고 service 키는 서버 전용이다. service 키를
 * 쿠키 세션 클라이언트에 절대 넘기지 않는다. 화면 코드는 이 모듈을 import할 수 없다.
 */
type SupabaseConfig = { url: string; key: string };

/** http(s) 오리진만 인정한다. 그 밖의 값(빈 문자열, 오타, 스킴 누락)은 설정 누락으로 본다. */
function config(
  urlValue: string | undefined,
  keyValue: string | undefined,
): SupabaseConfig | null {
  const url = urlValue?.trim();
  const key = keyValue?.trim();
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}

/** 브라우저에도 공개되는 값. 없으면 인증 화면을 구성할 수 없다. */
export function publicConfig(): SupabaseConfig | null {
  return config(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/** 서버 전용 service 키. 값이 없으면 승인 상태를 읽을 수 없고 승인으로 해석하지 않는다. */
export function serviceConfig(): SupabaseConfig | null {
  return config(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
  );
}

/**
 * 쿠키 저장소 bridge. 서버 컴포넌트는 `next/headers` 저장소를, 서버 액션·라우트 핸들러는
 * 갱신된 토큰을 실어 보낼 응답 객체를 넘긴다.
 */
export type SessionCookieBridge = CookieMethodsServer;

/** 세션 쿠키를 읽고 갱신하는 클라이언트. 설정이 없으면 만들어지지 않는다(null). */
export type SessionClient = SupabaseClient;

/**
 * 쿠키 저장소를 넘겨받아 세션 클라이언트를 만든다. 저장소가 다르기 때문에 Proxy와
 * 서버 컴포넌트가 같은 생성 경로를 공유하도록 분리했다. 설정이 없으면 null이다.
 */
export function createSessionClient(
  cookies: SessionCookieBridge,
): SessionClient | null {
  const settings = publicConfig();
  if (!settings) return null;
  return createServerClient(settings.url, settings.key, { cookies });
}

/** Auth 사용자 객체를 도메인 검증 입력으로 좁힌다. 판단 규칙은 도메인 모듈에만 둔다. */
export function identityInputOf(user: User): GoogleIdentityInput {
  return {
    id: user.id,
    email: user.email,
    emailConfirmedAt: user.email_confirmed_at,
    provider: user.app_metadata?.provider ?? null,
    identities: user.identities?.map((identity) => ({
      provider: identity.provider,
      identityData: identity.identity_data ?? null,
    })),
  };
}

/**
 * service 키로 PostgREST를 호출한다. 응답 상태를 그대로 돌려주어 호출자가 미적용 스키마(404)와
 * 서버 장애를 구분하게 한다. 리다이렉트는 따라가지 않고 8초에서 끊는다.
 */
async function serviceRequest(
  path: string,
  init: { method: string; body: unknown },
): Promise<{ status: number; body: unknown }> {
  const settings = serviceConfig();
  if (!settings) return { status: 0, body: null };
  const headers: Record<string, string> = {
    apikey: settings.key,
    "Content-Type": "application/json",
  };
  // 신형 publishable/secret 키는 Bearer 헤더 없이도 동작하지만, 구형 JWT 형식이면 필요하다.
  headers.Authorization = `Bearer ${settings.key}`;
  try {
    const response = await fetch(`${settings.url}/rest/v1/${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { status: response.status, body };
  } catch {
    // 네트워크·타임아웃·리다이렉트 거부는 모두 0으로 축약한다. 호출자가 장애로 처리한다.
    return { status: 0, body: null };
  }
}

/** PostgREST GET. 실패 상태는 호출자가 해석한다. */
export function serviceGet(path: string) {
  return serviceRequest(path, { method: "GET", body: undefined });
}

/** PostgREST RPC. 인자 이름은 DB 함수의 매개변수 이름과 같아야 한다. */
export function serviceRpc(name: string, args: Record<string, unknown>) {
  return serviceRequest(`rpc/${name}`, { method: "POST", body: args });
}
