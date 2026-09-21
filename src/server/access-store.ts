import "server-only";

import {
  type AccessAction,
  type AccessDecision,
  type AccessRow,
  parseAccessDecision,
  toAccessRow,
} from "../domain/access";
import { serviceConfig, serviceGet, serviceRpc } from "./supabase";

/**
 * 승인 표(`public.access_users`)의 PostgREST 입출력.
 *
 * Proxy와 서버 컴포넌트가 같은 조회를 공유하도록 분리했다. 이 모듈은 세션을 읽지 않으므로
 * Proxy에서도 안전하게 쓸 수 있고, 판정 규칙은 담지 않는다.
 */
const ROW_FIELDS =
  "user_id,email,status,is_admin,revision,requested_at,decided_at";

export type RowLookup =
  | { kind: "row"; row: AccessRow }
  | { kind: "absent" }
  | { kind: "unconfigured" }
  | { kind: "error" };

/**
 * 단일 행 조회. 404는 마이그레이션 미적용(설정 누락), 그 밖의 실패는 장애로 구분한다.
 * 해석할 수 없는 행은 승인으로 넘기지 않는다.
 */
export async function lookupAccessRow(userId: string): Promise<RowLookup> {
  if (!serviceConfig()) return { kind: "unconfigured" };
  const response = await serviceGet(
    `access_users?select=${ROW_FIELDS}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  if (response.status === 404) return { kind: "unconfigured" };
  if (response.status !== 200 || !Array.isArray(response.body)) {
    return { kind: "error" };
  }
  if (response.body.length === 0) return { kind: "absent" };
  const row = toAccessRow(response.body[0]);
  return row ? { kind: "row", row } : { kind: "error" };
}

/** 관리자 화면의 가입 요청 목록. null은 조회 실패이며 빈 목록과 구분한다. */
export async function listAccessRows(): Promise<AccessRow[] | null> {
  if (!serviceConfig()) return null;
  const response = await serviceGet(
    `access_users?select=${ROW_FIELDS}&order=requested_at.desc&limit=200`,
  );
  if (response.status !== 200 || !Array.isArray(response.body)) return null;
  const rows = response.body.map(toAccessRow);
  return rows.every((row): row is AccessRow => row !== null) ? rows : null;
}

/**
 * 관리자 결정 한 건을 DB 함수로 실행한다.
 * 반환 코드가 없으면(장애·미적용) null이며, 호출자는 상태가 바뀌지 않은 것으로 다룬다.
 */
export async function decideAccess(
  actorId: string,
  input: { userId: string; action: AccessAction; expectedRevision: number },
): Promise<AccessDecision | null> {
  const response = await serviceRpc("access_decide", {
    p_actor: actorId,
    p_user_id: input.userId,
    p_action: input.action,
    p_expected_revision: input.expectedRevision,
  });
  if (response.status !== 200) return null;
  return parseAccessDecision(response.body);
}
