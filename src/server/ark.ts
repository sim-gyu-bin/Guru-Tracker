import "server-only";
import { createHash } from "node:crypto";
import type { ArkFund, ArkSnapshot, ArkView } from "../domain/ark";
import { isArkFund } from "../domain/ark";
import { collectArkFund } from "./ingestion/ark";

type Config = { url: string; secret: string };
type State = {
  current_snapshot: ArkSnapshot | null;
  previous_snapshot: ArkSnapshot | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  lease_until: string | null;
};
const MESSAGES: Record<string, string> = {
  ARK_ACCESS:
    "ARK 공식 원문에 접근하지 못했습니다. 기존 보유 자료는 보존됩니다.",
  ARK_VALIDATION:
    "공식 보유 파일의 완전성을 검증하지 못해 반영을 보류했습니다.",
  STORAGE_ERROR: "공식 원문을 보관하지 못해 기존 보유 자료를 유지했습니다.",
  DATABASE_ERROR: "저장된 보유 자료 서비스에 연결하지 못했습니다.",
  SYNC_FAILED: "동기화를 완료하지 못했습니다. 기존 보유 자료는 보존됩니다.",
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

/** 마이그레이션 미적용은 장애가 아니라 설정 누락이다. PostgREST는 없는 테이블을 404로 알린다. */
async function tableMissing(response: Response): Promise<boolean> {
  if (response.status !== 404) return false;
  const failure: unknown = await response.json().catch(() => null);
  if (!failure || typeof failure !== "object") return true;
  const code = (failure as Record<string, unknown>).code;
  return code === undefined || code === "PGRST205" || code === "42P01";
}

/** 캐시만 읽으며 수집을 시작하지 않는다. 설정 누락·미적용 스키마·DB 장애·한 시간 stale·유효 lease를 구분한다. */
export async function getArkView(fund: ArkFund): Promise<ArkView> {
  const empty: ArkView = {
    fund,
    snapshot: null,
    previousSnapshot: null,
    status: "unconfigured",
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    syncing: false,
    stale: true,
  };
  if (!isArkFund(fund))
    return {
      ...empty,
      status: "error",
      lastError: "지원하지 않는 펀드입니다.",
    };
  const settings = config();
  if (!settings)
    return { ...empty, lastError: "Supabase 서버 설정이 필요합니다." };
  try {
    const response = await fetch(
      `${settings.url}/rest/v1/ark_state?fund=eq.${fund}&select=current_snapshot,previous_snapshot,last_attempt_at,last_success_at,last_error,lease_until`,
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
          "보유 자료 테이블이 아직 적용되지 않았습니다. supabase/migrations/202609150001_ark.sql을 적용해 주세요.",
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
      fund,
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
      // 시간별로 공식 파일 변경 여부를 확인하므로 마지막 성공 후 한 시간을 기준으로 삼는다.
      // 자료 기준일(reportDate)은 화면에서 따로 표시하며 주말에 갱신된 것처럼 보정하지 않는다.
      stale:
        !Number.isFinite(lastSuccess) || Date.now() - lastSuccess >= 3_600_000,
    };
  } catch {
    return { ...empty, status: "error", lastError: MESSAGES.DATABASE_ERROR };
  }
}

/** 접근 갱신과 Supabase Cron이 공유하는 조정자. 원문을 먼저 저장하고 유효 펜싱 토큰으로만 원자 커밋한다. */
export async function syncArk(fund: ArkFund): Promise<{
  status: "updated" | "unchanged" | "busy" | "failed";
  message?: string;
}> {
  if (!isArkFund(fund))
    return { status: "failed", message: "지원하지 않는 펀드입니다." };
  const settings = config();
  if (!settings)
    return { status: "failed", message: "Supabase 서버 설정이 필요합니다." };
  let fence: string | null = null;
  let stage = "DATABASE_ERROR";
  // 수집·업로드 35초 + 커밋 8초 + 실패 기록 8초로 네트워크 대기를 제한하고 60초까지 반환 여유를 남긴다.
  const deadline = AbortSignal.timeout(35_000);
  try {
    const acquired = await rpc(settings, "ark_acquire", { p_fund: fund });
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
    stage = "ARK_ACCESS";
    const verified = await collectArkFund(fund, deadline);
    stage = "STORAGE_ERROR";
    // 문서·원문 내용으로 주소를 고정한다. 같은 원문 재처리는 기존 객체를 재사용하며 삭제·덮어쓰지 않는다.
    const rawPrefix = `ark/${fund}/${verified.documentHash}`;
    for (const original of verified.originals) {
      const contentHash = createHash("sha256")
        .update(original.text)
        .digest("hex");
      const objectUrl = `${settings.url}/storage/v1/object/ark-originals/${rawPrefix}/${original.name}/${contentHash}`;
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
    const status = await rpc(settings, "ark_commit", {
      p_fund: fund,
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
        await rpc(settings, "ark_fail", {
          p_fund: fund,
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
