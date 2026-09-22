import "server-only";

import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";

import {
  type AccessRow,
  isAdminRow,
  toAccessRow,
  type VerifiedIdentity,
} from "../domain/access";
import { lookupAccessRow } from "./access-store";
import { adminEmail } from "./config";
import { sendAccessRequestMail } from "./mail";
import { type SessionState, sessionState } from "./session";
import { serviceConfig, serviceRpc } from "./supabase";

/**
 * 승인 기반 접근 제어의 서버 경계.
 *
 * 판정은 매 요청마다 DB의 `public.access_users`를 다시 읽는다. 세션 토큰은 신원만 뜻하고
 * 승인 여부는 담지 않으므로, 접근 해제는 다음 요청부터 즉시 적용된다. 상태를 확인할 수 없을 때는
 * 승인으로 해석하지 않는다(모두 차단).
 */

/** 현재 요청의 접근 상태. 확인 실패와 미승인을 구분해 화면 문구를 정확히 고른다. */
export type AccessState =
  | { kind: "member"; row: AccessRow }
  | { kind: "unresolved"; reason: "absent" | "unconfigured" | "error" }
  | { kind: "anonymous" }
  | { kind: "unverified" };

/** 세션 판정 결과를 접근 상태로 옮긴다. 세션 단계의 실패도 승인으로 넘기지 않는다. */
function fromSession(session: SessionState): AccessState | null {
  if (session.kind === "anonymous" || session.kind === "unverified") {
    return session;
  }
  if (session.kind === "unconfigured") {
    return { kind: "unresolved", reason: "unconfigured" };
  }
  return null;
}

/** 수집·화면을 열기 전에 쓰는 읽기 전용 판정. 가입 요청을 만들지 않는다. */
export async function accessState(): Promise<AccessState> {
  const session = await sessionState();
  const settled = fromSession(session);
  if (settled) return settled;
  // fromSession이 null을 돌려주면 신원이 확인된 세션뿐이다. 그 밖의 값은 승인으로 해석하지 않는다.
  if (session.kind !== "identity") {
    return { kind: "unresolved", reason: "error" };
  }
  const lookup = await lookupAccessRow(session.userId);
  return lookup.kind === "row"
    ? { kind: "member", row: lookup.row }
    : { kind: "unresolved", reason: lookup.kind };
}

/**
 * 최초 Google 로그인의 가입 요청을 접수한다.
 *
 * 세션에서 확인된 신원을 인자로 받는다. 콜백은 자기가 만든 세션 클라이언트로 코드를 교환한 뒤
 * 이 함수를 호출하므로 여기서 세션 쿠키를 다시 읽지 않는다(같은 요청에서 저장소가 갈라지지 않게).
 * 상태가 이미 있는 계정은 그대로 두고, 새로 만들어진 대기 요청일 때만 관리자 알림을 한 번 보낸다.
 * 알림 실패는 요청 행을 되돌리지 않는다. 관리자 지정은 서버 환경 변수 주소와 provider가 확인한
 * Google 이메일이 모두 같을 때만 DB가 판정하며, 일반 사용자는 스스로 관리자가 될 수 없다.
 * 같은 이메일의 다른 계정은 DB 고유 색인이 막고, 그 실패는 승인이 아니라 확인 불가로 돌려준다.
 * 이 함수는 계정을 합치지 않는다.
 */
export async function provisionIdentity(
  identity: VerifiedIdentity,
): Promise<AccessState> {
  if (!serviceConfig()) return { kind: "unresolved", reason: "unconfigured" };

  const submitted = await serviceRpc("access_request_submit", {
    p_user_id: identity.userId,
    p_email: identity.email,
  });
  if (submitted.status !== 200) {
    return { kind: "unresolved", reason: "error" };
  }
  const payload =
    typeof submitted.body === "object" && submitted.body !== null
      ? (submitted.body as { created?: unknown; user?: unknown })
      : null;
  let row = toAccessRow(payload?.user);
  if (!row) return { kind: "unresolved", reason: "error" };

  const configuredAdmin = adminEmail();
  if (configuredAdmin && row.email === configuredAdmin && !row.isAdmin) {
    await serviceRpc("access_confirm_admin", {
      p_user_id: identity.userId,
      // DB 함수 매개변수 이름과 정확히 같아야 PostgREST가 인자를 찾는다.
      p_admin_email: configuredAdmin,
    });
    const confirmed = await lookupAccessRow(identity.userId);
    if (confirmed.kind === "row") row = confirmed.row;
  }

  if (payload?.created === true && row.status === "pending") {
    await sendAccessRequestMail({
      userId: row.userId,
      email: row.email,
      revision: row.revision,
      requestedAt: row.requestedAt,
    });
  }
  return { kind: "member", row };
}

/** 승인된 사용자만 열 수 있는 화면. 미인증은 404, 로그인한 미승인은 안내 화면으로 보낸다. */
export async function requireApprovedPage(): Promise<AccessRow> {
  const state = await accessState();
  if (state.kind === "member" && state.row.status === "approved") {
    return state.row;
  }
  if (state.kind === "anonymous" || state.kind === "unverified") {
    notFound();
  }
  redirect("/pending");
}

/** 관리자 화면과 결정 액션은 승인된 관리자만 허용하고 나머지는 404로 종료한다. */
export async function requireAdminPage(): Promise<AccessRow> {
  const state = await accessState();
  if (state.kind === "member" && isAdminRow(state.row)) return state.row;
  notFound();
}

type ApiDenial = { ok: false; response: NextResponse };

/** 내부 경로를 그대로 되돌려 주는 JSON 오류. 화면 캐시가 남지 않게 no-store를 붙인다. */
function deny(status: number, error: string): ApiDenial {
  return {
    ok: false,
    response: NextResponse.json(
      { status: "failed", error },
      { status, headers: { "Cache-Control": "no-store" } },
    ),
  };
}

/** 승인된 사용자만 쓰는 JSON API. 미로그인 401, 미승인 403, 확인 불가 503으로 구분한다. */
export async function approvedApi(): Promise<
  { ok: true; row: AccessRow } | ApiDenial
> {
  const state = await accessState();
  if (state.kind === "member" && state.row.status === "approved") {
    return { ok: true, row: state.row };
  }
  if (state.kind === "anonymous" || state.kind === "unverified") {
    return deny(401, "로그인이 필요합니다.");
  }
  if (state.kind === "member") {
    return deny(403, "가입 승인이 필요합니다.");
  }
  return deny(503, "접근 상태를 확인하지 못했습니다.");
}
