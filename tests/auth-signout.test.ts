import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import { NextRequest } from "next/server";

import { POST } from "../src/app/auth/signout/route";

/**
 * 로그아웃 회귀 테스트. 실제 라우트 핸들러를 import 해서 응답의 이동 주소와 만료 쿠키를 본다.
 *
 * Supabase Auth는 이 파일 안의 스텁 서버로 대신한다. 포트는 0번으로 열어 운영체제가 빈 포트를
 * 고르게 하므로 고정 포트 충돌이 없다. 세션 쿠키 이름은 공개 주소의 첫 호스트 라벨에서 나오므로
 * 스텁 주소가 정해진 뒤 같은 규칙으로 만든다.
 *
 * 확인하는 경계: 서버 폐기 실패(500), 성공(204), 청크로 나뉜 세션, 세션 없는 요청, 교차 출처 요청.
 * 폐기 실패 문구는 사용자가 본 로그아웃과 실제 세션 상태가 어긋나지 않게 하는 장치이므로,
 * 서버 폐기 여부와 무관하게 쿠키가 만료되는지와 문구가 언제 붙는지를 함께 고정한다.
 */
const APP = "http://localhost:3000";

let auth: Server;
let sessionKey: string;
let logoutStatus = 204;
let logoutCalls = 0;
const previousEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  app: process.env.APP_URL,
};

before(async () => {
  auth = createServer((request, response) => {
    if (
      request.method === "POST" &&
      request.url?.startsWith("/auth/v1/logout")
    ) {
      logoutCalls += 1;
      response.writeHead(logoutStatus, { "content-type": "application/json" });
      response.end(
        logoutStatus === 204 ? "" : JSON.stringify({ message: "stub" }),
      );
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "not found" }));
  });
  await new Promise<void>((resolve) => auth.listen(0, "127.0.0.1", resolve));
  const { port } = auth.address() as AddressInfo;

  // 설정은 요청마다 읽으므로 스텁 주소가 정해진 뒤에 넣는다. APP_URL은 로그아웃 경로가 쓰지 않는다.
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "stub-publishable-key";
  delete process.env.APP_URL;
  // `sb-<첫 호스트 라벨>-auth-token`. 주소가 127.0.0.1이므로 라벨은 127이다.
  sessionKey = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
});

after(async () => {
  for (const [key, value] of [
    ["NEXT_PUBLIC_SUPABASE_URL", previousEnv.url],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", previousEnv.key],
    ["APP_URL", previousEnv.app],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await new Promise<void>((resolve) => auth.close(() => resolve()));
});

/** 쿠키 값은 실제 세션이 아니라 형식만 맞춘 더미다. Auth 스텁이 서명을 확인하지 않는다. */
const sessionCookie = () => {
  const session = {
    access_token: "stub-access",
    refresh_token: "stub-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated" },
  };
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  return `${sessionKey}=${value}`;
};

function call(
  cookie: string | null,
  options: { origin?: string; forwardedHost?: string } = {},
): NextRequest {
  // HTTP/1.1부터 모든 요청에 Host가 붙고, 출처 판정은 Origin을 이 값(x-forwarded-host 우선)과 비교한다.
  // NextRequest는 URL에서 Host를 만들지 않으므로 브라우저가 보내는 값을 그대로 넣는다.
  const headers: Record<string, string> = {
    host: new URL(APP).host,
    origin: options.origin ?? APP,
  };
  if (options.forwardedHost)
    headers["x-forwarded-host"] = options.forwardedHost;
  if (cookie !== null) headers.cookie = cookie;
  return new NextRequest(`${APP}/auth/signout`, { method: "POST", headers });
}

/** 이 프로젝트의 세션 쿠키(청크 조각 포함)를 만료시키는 Set-Cookie만 고른다. */
const sessionClears = (response: Response) =>
  response.headers
    .getSetCookie()
    .filter(
      (value) =>
        value.startsWith(`${sessionKey}=`) ||
        value.startsWith(`${sessionKey}.`),
    );

/** 이동 주소는 상대·절대 어느 쪽으로도 올 수 있으므로 요청 주소를 기준으로 해석해 비교한다. */
const destination = (response: Response) =>
  new URL(response.headers.get("location") ?? "", APP);

function logout(
  cookie: string | null,
  options: { origin?: string; forwardedHost?: string } = {},
): Promise<Response> {
  logoutCalls = 0;
  return POST(call(cookie, options));
}

test("서버 폐기가 실패하면 쿠키를 지우고 미확인 문구를 붙인다", async () => {
  logoutStatus = 500;
  const response = await logout(sessionCookie());

  assert.equal(response.status, 303);
  assert.equal(destination(response).pathname, "/login");
  assert.equal(destination(response).search, "?logout=unconfirmed");
  const clears = sessionClears(response);
  assert.ok(
    clears.some(
      (value) => value.includes("Max-Age=0") && value.includes("Path=/"),
    ),
    `세션 쿠키 만료 없음: ${JSON.stringify(clears)}`,
  );
  assert.equal(logoutCalls, 1);
});

test("서버 폐기가 성공하면 같은 만료를 적용하고 문구는 붙이지 않는다", async () => {
  logoutStatus = 204;
  const response = await logout(sessionCookie());

  assert.equal(response.status, 303);
  assert.equal(destination(response).pathname, "/login");
  assert.equal(destination(response).search, "");
  const clears = sessionClears(response);
  assert.ok(
    clears.some(
      (value) => value.includes("Max-Age=0") && value.includes("Path=/"),
    ),
    `세션 쿠키 만료 없음: ${JSON.stringify(clears)}`,
  );
  assert.equal(logoutCalls, 1);
});

test("청크로 나뉜 세션은 조각을 모두 지우고 폐기 실패 문구를 만들지 않는다", async () => {
  // 조각 값이 실제 세션이 아니므로 SDK는 Auth 서버에 폐기를 요청하지 않는다. 폐기를 확인하지
  // 못한 것이 아니므로 미확인 문구도 붙이지 않는다.
  logoutStatus = 500;
  const response = await logout(
    `${sessionKey}.0=chunk-a; ${sessionKey}.1=chunk-b`,
  );

  assert.equal(response.status, 303);
  assert.equal(destination(response).pathname, "/login");
  assert.equal(destination(response).search, "");
  const names = sessionClears(response).map((value) => value.split("=")[0]);
  assert.deepEqual(names.sort(), [`${sessionKey}.0`, `${sessionKey}.1`]);
  assert.equal(logoutCalls, 0);
});

test("세션이 없던 요청은 폐기하지 않고 만료 쿠키도 만들지 않는다", async () => {
  logoutStatus = 500;
  const response = await logout(null);

  assert.equal(response.status, 303);
  assert.equal(destination(response).pathname, "/login");
  assert.equal(destination(response).search, "");
  assert.deepEqual(sessionClears(response), []);
  assert.equal(logoutCalls, 0);
});

test("교차 출처 요청은 거절하고 쿠키·폐기 요청을 만들지 않는다", async () => {
  logoutStatus = 204;
  const response = await logout(sessionCookie(), {
    origin: "http://evil.example",
  });

  assert.equal(response.status, 403);
  assert.deepEqual(sessionClears(response), []);
  assert.equal(logoutCalls, 0);
});

test("리버스 프록시 뒤에서는 도착 호스트로 같은 출처를 판정한다", async () => {
  // 프록시가 실제 도착 호스트를 x-forwarded-host로 넘긴다. 이 값과 Origin이 같으면 정상 요청이다.
  logoutStatus = 204;
  const accepted = await logout(sessionCookie(), {
    origin: "https://tracker.example",
    forwardedHost: "tracker.example",
  });
  assert.equal(accepted.status, 303);
  assert.equal(destination(accepted).pathname, "/login");
  assert.equal(logoutCalls, 1);

  // 도착 호스트가 다른 교차 출처 요청은 프록시 구성과 무관하게 거절한다.
  const rejected = await logout(sessionCookie(), {
    origin: "https://evil.example",
    forwardedHost: "tracker.example",
  });
  assert.equal(rejected.status, 403);
  assert.equal(logoutCalls, 0);
});
