/** 수집 건강과 Cron 설정은 독립적으로 표시한다. 공시 기준일의 최신성을 뜻하지 않는다. */
export type SyncHealthStatus =
  | "healthy"
  | "syncing"
  | "delayed"
  | "failed"
  | "empty";
/** 같은 이름의 Cron이 둘 이상이면 활성 여부와 무관하게 중복으로 본다. */
export type SyncScheduleStatus =
  | "active"
  | "disabled"
  | "missing"
  | "duplicate";
/** 관리자에게 노출할 최소 운영 정보. bigint 버전은 문자열을 유지한다. */
export type SyncHealthRow = Readonly<{
  key: string;
  label: string;
  source: "SEC 13F" | "ARK holdings" | "House PTR";
  health: SyncHealthStatus;
  scheduleStatus: SyncScheduleStatus;
  schedule: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  datasetVersion: string;
}>;
/** 조회 실패는 빈 정상 목록과 구별하며 DB 판정 시각은 ready일 때만 제공한다. */
export type SyncHealthView = Readonly<{
  status: "ready" | "unconfigured" | "error";
  checkedAt: string | null;
  rows: readonly SyncHealthRow[];
}>;

const UNITS = [
  ["stanley", "스탠리 드러켄밀러", "SEC 13F"],
  ["burry", "마이클 버리", "SEC 13F"],
  ["laffont", "필리프 라퐁", "SEC 13F"],
  ["gerstner", "브래드 거스트너", "SEC 13F"],
  ["tepper", "데이비드 테퍼", "SEC 13F"],
  ["aschenbrenner", "레오폴드 아셴브레너", "SEC 13F"],
  ["house", "낸시 펠로시", "House PTR"],
  ["ark:ARKK", "캐시 우드 · ARKK", "ARK holdings"],
  ["ark:ARKQ", "캐시 우드 · ARKQ", "ARK holdings"],
  ["ark:ARKW", "캐시 우드 · ARKW", "ARK holdings"],
  ["ark:ARKG", "캐시 우드 · ARKG", "ARK holdings"],
  ["ark:ARKF", "캐시 우드 · ARKF", "ARK holdings"],
  ["ark:ARKX", "캐시 우드 · ARKX", "ARK holdings"],
] as const;
const ROW_FIELDS = [
  "key",
  "schedule_count",
  "schedule",
  "active",
  "has_snapshot",
  "has_error",
  "last_attempt_at",
  "last_success_at",
  "lease_until",
  "dataset_version",
];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return (
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

/** PostgreSQL timestamptz의 시간대 있는 유한 시각만 허용한다. JS의 잘못된 날짜 자동 보정을 거부한다. */
function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(
      value,
    );
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== match[1]
  )
    return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * admin_sync_health의 닫힌 원시 계약을 검증한다. 누락·중복·미래 성공시각 등은 전체 error로 닫는다.
 * 건강 판정은 클라이언트 시계가 아닌 DB checked_at을 사용하며 원시 오류 문자열은 받지 않는다.
 */
export function parseSyncHealthView(value: unknown): SyncHealthView {
  const error: SyncHealthView = { status: "error", checkedAt: null, rows: [] };
  if (!record(value) || !exactFields(value, ["checked_at", "rows"]))
    return error;
  const checkedAt = timestamp(value.checked_at);
  if (
    checkedAt === null ||
    !Array.isArray(value.rows) ||
    value.rows.length !== UNITS.length
  )
    return error;
  const byKey = new Map<string, Record<string, unknown>>();
  for (const raw of value.rows) {
    if (
      !record(raw) ||
      !exactFields(raw, ROW_FIELDS) ||
      typeof raw.key !== "string" ||
      !UNITS.some(([key]) => key === raw.key) ||
      byKey.has(raw.key)
    )
      return error;
    byKey.set(raw.key, raw);
  }
  const rows: SyncHealthRow[] = [];
  for (const [key, label, source] of UNITS) {
    const raw = byKey.get(key);
    if (!raw) return error;
    const count = raw.schedule_count;
    if (
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      typeof raw.has_snapshot !== "boolean" ||
      typeof raw.has_error !== "boolean" ||
      typeof raw.dataset_version !== "string" ||
      !/^(0|[1-9]\d*)$/.test(raw.dataset_version) ||
      raw.dataset_version.length > 19 ||
      BigInt(raw.dataset_version) > BigInt("9223372036854775807")
    )
      return error;
    if (
      count === 1
        ? typeof raw.active !== "boolean" ||
          typeof raw.schedule !== "string" ||
          !raw.schedule.trim()
        : raw.active !== null || raw.schedule !== null
    )
      return error;
    const attempt =
      raw.last_attempt_at === null ? null : timestamp(raw.last_attempt_at);
    const success =
      raw.last_success_at === null ? null : timestamp(raw.last_success_at);
    const lease = raw.lease_until === null ? null : timestamp(raw.lease_until);
    if (
      (raw.last_attempt_at !== null && attempt === null) ||
      (raw.last_success_at !== null && success === null) ||
      (raw.lease_until !== null && lease === null) ||
      (attempt !== null && attempt > checkedAt) ||
      (success !== null && success > checkedAt) ||
      (lease !== null && lease > checkedAt && attempt === null)
    )
      return error;
    const health: SyncHealthStatus =
      lease !== null && lease > checkedAt
        ? "syncing"
        : raw.has_error
          ? "failed"
          : !raw.has_snapshot
            ? "empty"
            : success === null || checkedAt - success >= 3_600_000
              ? "delayed"
              : "healthy";
    rows.push({
      key,
      label,
      source,
      health,
      scheduleStatus:
        count === 0
          ? "missing"
          : count > 1
            ? "duplicate"
            : raw.active
              ? "active"
              : "disabled",
      schedule: raw.schedule as string | null,
      lastAttemptAt: raw.last_attempt_at as string | null,
      lastSuccessAt: raw.last_success_at as string | null,
      datasetVersion: raw.dataset_version,
    });
  }
  return { status: "ready", checkedAt: value.checked_at as string, rows };
}
