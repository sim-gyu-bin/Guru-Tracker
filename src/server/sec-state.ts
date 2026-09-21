import "server-only";
import { createHash } from "node:crypto";
import type { SecManager, SecSnapshot, SecView } from "../domain/sec";
import { collectSec } from "./sec";

/**
 * 대상별 저장 이름은 manager 값에서 직접 만든다. manager는 닫힌 유니온("stanley" | "burry")이며
 * 화면·요청·환경 변수에서 온 임의 문자열이 아니므로 테이블·RPC 식별자로 그대로 쓸 수 있다.
 * 각 대상은 자기 캐시 테이블(<manager>_state), 변경 이벤트 표(<manager>_events),
 * RPC(<manager>_acquire/commit/fail), Storage 원문 접두사(<manager>/)만 다루며
 * 다른 대상의 스냅샷은 DB 검증에서 거부된다.
 */
const stateTable = (manager: SecManager) => `${manager}_state`;
type Config = { url: string; secret: string };
type State = {
  current_snapshot: SecSnapshot | null;
  previous_snapshot: SecSnapshot | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  lease_until: string | null;
};
const MESSAGES: Record<string, string> = {
  SEC_ACCESS: "SEC 공식 원문에 접근하지 못했습니다. 기존 공시는 보존됩니다.",
  SEC_VALIDATION: "공식 공시의 완전성을 검증하지 못해 반영을 보류했습니다.",
  STORAGE_ERROR: "공식 원문을 보관하지 못해 기존 공시를 유지했습니다.",
  DATABASE_ERROR: "저장된 공시 서비스에 연결하지 못했습니다.",
  SYNC_FAILED: "동기화를 완료하지 못했습니다. 기존 공시는 보존됩니다.",
};
function config(): Config | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    )
      return null;
    return { url: parsed.origin, secret };
  } catch {
    return null;
  }
}
function headers(settings: Config): Record<string, string> {
  // 새 sb_secret 키는 apikey에만 넣는다. 레거시 service_role JWT만 Bearer로도 전달한다.
  return {
    apikey: settings.secret,
    ...(settings.secret.startsWith("eyJ")
      ? { Authorization: `Bearer ${settings.secret}` }
      : {}),
    "Content-Type": "application/json",
  };
}
async function rpc(
  settings: Config,
  name: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${settings.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(settings),
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("DATABASE_ERROR");
  return response.json();
}

/** 캐시만 읽으며 수집을 시작하지 않는다. 설정 누락·DB 장애·한 시간 stale·유효 lease를 구분한다. */
export async function getSecView(manager: SecManager): Promise<SecView> {
  const empty: SecView = {
    snapshot: null,
    previousSnapshot: null,
    status: "unconfigured",
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    syncing: false,
    stale: true,
  };
  const settings = config();
  const userAgent = process.env.SEC_USER_AGENT?.trim();
  const secConfigured =
    !!userAgent && /\S+@\S+\.\S+/.test(userAgent) && !/[\r\n]/.test(userAgent);
  if (!settings)
    return { ...empty, lastError: "Supabase 서버 설정이 필요합니다." };
  try {
    const response = await fetch(
      `${settings.url}/rest/v1/${stateTable(manager)}?id=eq.true&select=current_snapshot,previous_snapshot,last_attempt_at,last_success_at,last_error,lease_until`,
      {
        headers: headers(settings),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) throw new Error("DATABASE_ERROR");
    const rows: unknown = await response.json();
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      !rows[0] ||
      typeof rows[0] !== "object"
    )
      throw new Error("DATABASE_ERROR");
    const state = rows[0] as State;
    const lastSuccess = state.last_success_at
      ? Date.parse(state.last_success_at)
      : Number.NaN;
    return {
      snapshot: state.current_snapshot,
      previousSnapshot: state.previous_snapshot,
      status: !secConfigured
        ? "unconfigured"
        : state.last_error
          ? "error"
          : state.current_snapshot
            ? "ready"
            : "empty",
      lastAttemptAt: state.last_attempt_at,
      lastSuccessAt: state.last_success_at,
      lastError: state.last_error
        ? (MESSAGES[state.last_error] ?? MESSAGES.SYNC_FAILED)
        : !secConfigured
          ? "연락처를 포함한 SEC_USER_AGENT 서버 설정이 필요합니다."
          : null,
      syncing:
        !!state.lease_until && Date.parse(state.lease_until) > Date.now(),
      stale:
        !Number.isFinite(lastSuccess) || Date.now() - lastSuccess >= 3_600_000,
    };
  } catch {
    return { ...empty, status: "error", lastError: MESSAGES.DATABASE_ERROR };
  }
}

/** 대상 하나의 모든 호출 경로가 공유하는 조정자. 원문을 먼저 저장하고 유효 펜싱 토큰으로만 원자 커밋한다. */
export async function syncSec(manager: SecManager): Promise<{
  status: "updated" | "unchanged" | "busy" | "failed";
  message?: string;
}> {
  const settings = config();
  const userAgent = process.env.SEC_USER_AGENT?.trim();
  if (
    !settings ||
    !userAgent ||
    !/\S+@\S+\.\S+/.test(userAgent) ||
    /[\r\n]/.test(userAgent)
  )
    return {
      status: "failed",
      message:
        "Supabase 서버 설정과 연락처를 포함한 SEC_USER_AGENT가 필요합니다.",
    };
  let fence: string | null = null;
  let stage = "DATABASE_ERROR";
  // 수집·업로드 35초 + 커밋 8초 + 실패 기록 8초로 네트워크 대기를 제한하고 60초까지 반환 여유를 남긴다.
  const deadline = AbortSignal.timeout(35_000);
  try {
    const acquired = await rpc(settings, `${manager}_acquire`, {});
    if (acquired === null)
      return { status: "busy", message: "다른 동기화가 진행 중입니다." };
    if (acquired === "cooldown")
      return {
        status: "busy",
        message:
          "최근 동기화를 시도했습니다. 마지막 시도부터 60초 후 다시 요청해 주세요.",
      };
    if (typeof acquired !== "string" || !/^\d+$/.test(acquired))
      throw new Error("DATABASE_ERROR");
    fence = acquired;
    stage = "SEC_ACCESS";
    const verified = await collectSec(manager, userAgent, deadline);
    stage = "STORAGE_ERROR";
    // 문서·원문 내용으로 주소를 고정한다. 같은 원문 재처리는 기존 객체를 재사용하며 삭제·덮어쓰지 않는다.
    // 접두사는 대상별로 나누고 DB 커밋 검증이 같은 값을 요구하므로 다른 대상의 원문과 섞이지 않는다.
    const rawPrefix = `${manager}/${verified.documentHash}`;
    for (const original of verified.originals) {
      const contentHash = createHash("sha256")
        .update(original.text)
        .digest("hex");
      const objectUrl = `${settings.url}/storage/v1/object/sec-originals/${rawPrefix}/${original.name}/${contentHash}`;
      const signal = AbortSignal.any([deadline, AbortSignal.timeout(10_000)]);
      const response = await fetch(objectUrl, {
        method: "POST",
        headers: {
          ...headers(settings),
          "Content-Type": original.contentType,
          "x-upsert": "false",
        },
        body: original.text,
        cache: "no-store",
        redirect: "error",
        signal,
      });
      if (response.ok) continue;
      // Storage 버전에 따라 중복 객체가 HTTP 400 + Duplicate 또는 HTTP 409로 반환된다.
      let duplicate = response.status === 409;
      if (response.status === 400) {
        const failure: unknown = await response.json().catch(() => null);
        if (failure && typeof failure === "object") {
          const detail = failure as Record<string, unknown>;
          duplicate =
            detail.error === "Duplicate" ||
            detail.code === "ResourceAlreadyExists" ||
            detail.code === "KeyAlreadyExists";
        }
      }
      if (!duplicate) throw new Error("STORAGE_ERROR");
      // 이름만 신뢰하지 않고 기존 객체의 바이트 수와 SHA-256을 확인한다. 불일치하면 DB 반영을 거부한다.
      const existing = await fetch(objectUrl, {
        headers: headers(settings),
        cache: "no-store",
        redirect: "error",
        signal,
      });
      if (!existing.ok || !existing.body) throw new Error("STORAGE_ERROR");
      const reader = existing.body.getReader();
      const expectedSize = Buffer.byteLength(original.text);
      const digest = createHash("sha256");
      let receivedSize = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        receivedSize += chunk.value.byteLength;
        if (receivedSize > expectedSize) {
          await reader.cancel();
          throw new Error("STORAGE_ERROR");
        }
        digest.update(chunk.value);
      }
      if (receivedSize !== expectedSize || digest.digest("hex") !== contentHash)
        throw new Error("STORAGE_ERROR");
    }
    deadline.throwIfAborted();
    stage = "DATABASE_ERROR";
    const status = await rpc(settings, `${manager}_commit`, {
      p_fence: fence,
      p_snapshot: verified.snapshot,
      p_document_hash: verified.documentHash,
      p_normalized_hash: verified.normalizedHash,
      p_raw_prefix: rawPrefix,
    });
    if (status !== "updated" && status !== "unchanged" && status !== "busy")
      throw new Error("DATABASE_ERROR");
    return { status };
  } catch (error) {
    const code =
      error instanceof Error && Object.hasOwn(MESSAGES, error.message)
        ? error.message
        : stage;
    if (fence) {
      try {
        await rpc(settings, `${manager}_fail`, {
          p_fence: fence,
          p_error: code,
        });
      } catch {
        /* DB 장애로 실패 상태 기록까지 불가능해도 기존 스냅샷은 그대로 둔다. */
      }
    }
    return {
      status: "failed",
      message: MESSAGES[code] ?? MESSAGES.SYNC_FAILED,
    };
  }
}
