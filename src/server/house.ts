import "server-only";
import { createHash } from "node:crypto";
import type { HousePtrSnapshot, HousePtrView } from "../domain/house";
import { collectHousePtr } from "./ingestion/house";

type Config = { url: string; secret: string };
type State = {
  current_snapshot: HousePtrSnapshot | null;
  previous_snapshot: HousePtrSnapshot | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  lease_until: string | null;
};

/**
 * 공급자 응답을 화면 문구로 축약한 표. DB에는 왼쪽 키만 저장하고 화면에는 이 문구만 노출한다.
 * 기존 PTR 스냅샷을 지우지 않는다는 사실을 모든 실패 문구에 담는다.
 */
const MESSAGES: Record<string, string> = {
  HOUSE_ACCESS:
    "미국 하원 공식 원문에 접근하지 못했습니다. 기존 공시 자료는 보존됩니다.",
  HOUSE_VALIDATION: "공식 PTR 원문을 검증하지 못해 반영을 보류했습니다.",
  STORAGE_ERROR: "공식 원문을 보관하지 못해 기존 공시 자료를 유지했습니다.",
  DATABASE_ERROR: "저장된 공시 자료 서비스에 연결하지 못했습니다.",
  SYNC_FAILED: "동기화를 완료하지 못했습니다. 기존 공시 자료는 보존됩니다.",
};

/** 서버 전용 환경 변수에서 Supabase 주소와 비밀 키를 읽는다. 값이 없거나 형식이 어긋나면 null. */
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

/** PostgREST RPC 한 건. 실패는 모두 DATABASE_ERROR로 축약하고 8초에서 끊는다. */
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

/** 마이그레이션 미적용은 장애가 아니라 설정 누락이다. PostgREST는 없는 테이블을 404로 알린다. */
async function tableMissing(response: Response): Promise<boolean> {
  if (response.status !== 404) return false;
  const failure: unknown = await response.json().catch(() => null);
  if (!failure || typeof failure !== "object") return true;
  const code = (failure as Record<string, unknown>).code;
  return code === undefined || code === "PGRST205" || code === "42P01";
}

/**
 * 캐시만 읽으며 수집을 시작하지 않는다. 설정 누락·미적용 스키마·DB 장애·한 시간 stale·유효 lease를 구분한다.
 * 스냅샷은 최신 PTR 문서 1건이며 보유 목록이 아니다.
 */
export async function getHousePtrView(): Promise<HousePtrView> {
  const empty: HousePtrView = {
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
  if (!settings)
    return { ...empty, lastError: "Supabase 서버 설정이 필요합니다." };
  try {
    const response = await fetch(
      `${settings.url}/rest/v1/house_ptr_state?select=current_snapshot,previous_snapshot,last_attempt_at,last_success_at,last_error,lease_until`,
      {
        headers: headers(settings),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (await tableMissing(response))
      return {
        ...empty,
        lastError:
          "공시 자료 테이블이 아직 적용되지 않았습니다. supabase/migrations/202609160001_house_ptr.sql을 적용해 주세요.",
      };
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
      status: state.last_error
        ? "error"
        : state.current_snapshot
          ? "ready"
          : "empty",
      lastAttemptAt: state.last_attempt_at,
      lastSuccessAt: state.last_success_at,
      lastError: state.last_error
        ? (MESSAGES[state.last_error] ?? MESSAGES.SYNC_FAILED)
        : null,
      syncing:
        !!state.lease_until && Date.parse(state.lease_until) > Date.now(),
      // 하원 색인이 수시로 추가되므로 마지막 성공 후 한 시간을 stale 기준으로 삼는다.
      // 제출일(filingDate)은 화면에서 따로 표시하며 주말에 갱신된 것처럼 보정하지 않는다.
      stale:
        !Number.isFinite(lastSuccess) || Date.now() - lastSuccess >= 3_600_000,
    };
  } catch {
    return { ...empty, status: "error", lastError: MESSAGES.DATABASE_ERROR };
  }
}

/**
 * 접근 갱신과 Supabase Cron이 공유하는 멱등 조정자. 최신 PTR 문서 1건을 수집해 원문을 먼저 저장하고
 * 유효 펜싱 토큰으로만 원자 커밋한다. 검증되지 않은 문서는 절대 반영하지 않는다(전체 실패).
 */
export async function syncHousePtr(): Promise<{
  status: "updated" | "unchanged" | "busy" | "failed";
  message?: string;
}> {
  const settings = config();
  if (!settings)
    return { status: "failed", message: "Supabase 서버 설정이 필요합니다." };
  let fence: string | null = null;
  let stage = "DATABASE_ERROR";
  // 수집·업로드 35초 + 커밋 8초 + 실패 기록 8초로 네트워크 대기를 제한하고 60초까지 반환 여유를 남긴다.
  const deadline = AbortSignal.timeout(35_000);
  try {
    const acquired = await rpc(settings, "house_ptr_acquire", {});
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
    stage = "HOUSE_ACCESS";
    const verified = await collectHousePtr(deadline);
    stage = "STORAGE_ERROR";
    // 문서 내용으로 주소를 고정한다. 같은 원문 재처리는 기존 객체를 재사용하며 삭제·덮어쓰지 않는다.
    const rawPrefix = `house/${verified.documentHash}`;
    for (const original of verified.originals) {
      const contentHash = createHash("sha256")
        .update(original.bytes)
        .digest("hex");
      const objectUrl = `${settings.url}/storage/v1/object/house-originals/${rawPrefix}/${original.name}/${contentHash}`;
      const signal = AbortSignal.any([deadline, AbortSignal.timeout(10_000)]);
      const response = await fetch(objectUrl, {
        method: "POST",
        headers: {
          ...headers(settings),
          "Content-Type": original.contentType,
          "x-upsert": "false",
        },
        body: original.bytes,
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
      const expectedSize = original.bytes.byteLength;
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
    const status = await rpc(settings, "house_ptr_commit", {
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
        await rpc(settings, "house_ptr_fail", {
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
