import "server-only";

import { NextResponse } from "next/server";

/**
 * 요청 출처 판정. 같은 출처에서 온 요청만 통과시킨다.
 *
 * Next의 server action 기본 방어는 `origin` 헤더가 없으면 경고만 남기고 통과시킨다
 * (`node_modules/next/dist/server/app-render/action-handler.js`). 쿠키를 실은 교차 출처 요청과
 * 헤더를 지운 요청을 그대로 신뢰할 수 없으므로, 결정을 실행하는 경로는 여기서 한 번 더 막는다.
 *
 * 판정 순서:
 * 1. `origin` 이 `null`(불투명 출처)이면 거부한다.
 * 2. `origin` 의 호스트와 요청이 도착한 호스트가 다르면 거부한다. 리버스 프록시 뒤에서는
 *    `x-forwarded-host`가 실제 도착 호스트이므로 먼저 본다.
 * 3. `origin` 이 아예 없는 요청은 브라우저가 붙이는 Fetch Metadata가 같은 출처를 확인해 줄 때만
 *    통과시킨다. 둘 다 없으면 출처를 확인할 수 없으므로 거부한다.
 *
 * 호스트만 비교하고 프로토콜은 비교하지 않는다. 우리 호스트에서 온 것이라면 같은 사이트이고,
 * 세션 쿠키는 호스트 단위의 Secure·SameSite 경계로 이미 보호된다.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (origin === "null") return false;
  if (origin === null) {
    return headers.get("sec-fetch-site") === "same-origin";
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded ? forwarded : headers.get("host")?.trim();
  return host !== undefined && host.length > 0 && originHost === host;
}

/**
 * 같은 사이트로 되돌리는 이동 응답을 만든다. `Location`은 상대 경로로만 준다.
 *
 * `NextResponse.redirect`는 절대 주소를 요구한다. 만들 수 있는 절대 주소는 요청 헤더나
 * `request.nextUrl.origin`뿐인데, 라우트 핸들러의 요청 URL은 실제 요청 호스트가 아니라 서버가
 * 듣는 주소로 만들어진다(Next는 요청 URL을 `<프로토콜>://<hostname>:<port>`로 구성하므로
 * `next start`에서는 항상 `http://localhost:<포트>`다). 그래서 `nextUrl.origin`으로 만든 절대
 * 주소는 운영에서 사용자를 다른 호스트로 보낸다. 프록시 응답에는 Next가 호스트가 같은 Location을
 * 상대 경로로 바꾸는 처리가 있지만 라우트 핸들러 응답에는 없다.
 *
 * 상대 경로는 브라우저가 실제로 요청한 주소를 기준으로 해석하므로 프록시·도메인 구성과 무관하게
 * 같은 사이트로 돌아가고, 요청 헤더로 목적지를 만들지 않으므로 외부 주소로 열릴 여지도 없다.
 * 대상은 호출자가 내부 경로로 정한다(`safeInternalPath`를 통과한 값 또는 고정 문구 경로).
 * 상태 코드는 GET 이동이면 307, POST 뒤 GET으로 바꾸는 로그아웃이면 303을 쓴다.
 */
export function sameSiteRedirect(target: string, status: number): NextResponse {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store", Location: target },
  });
}
