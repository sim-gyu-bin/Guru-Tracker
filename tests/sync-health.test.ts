import assert from "node:assert/strict";
import test from "node:test";
import { parseSyncHealthView } from "../src/domain/sync-health";

const CHECKED_AT = "2026-09-22T12:00:00+00:00";

function payload() {
  return {
    checked_at: CHECKED_AT,
    rows: [
      "stanley",
      "burry",
      "laffont",
      "gerstner",
      "tepper",
      "aschenbrenner",
      "house",
      "ark:ARKK",
      "ark:ARKQ",
      "ark:ARKW",
      "ark:ARKG",
      "ark:ARKF",
      "ark:ARKX",
    ].map((key) => ({
      key,
      schedule_count: 1,
      schedule: "0 * * * *" as string | null,
      active: true as boolean | null,
      has_snapshot: true,
      has_error: false,
      last_attempt_at: "2026-09-22T11:59:00Z" as string | null,
      last_success_at: "2026-09-22T11:59:01Z" as string | null,
      lease_until: null as string | null,
      dataset_version: "9223372036854775807",
    })),
  };
}

test("lease·오류·빈 캐시·지연 우선순위와 정확한 1시간 경계를 판정한다", () => {
  const raw = payload();
  Object.assign(raw.rows[0], {
    lease_until: "2026-09-22T12:00:01Z",
    has_error: true,
    has_snapshot: false,
  });
  Object.assign(raw.rows[1], {
    lease_until: CHECKED_AT,
    has_error: true,
    has_snapshot: false,
  });
  Object.assign(raw.rows[2], { has_snapshot: false, last_success_at: null });
  raw.rows[3].last_success_at = null;
  raw.rows[4].last_success_at = "2026-09-22T11:00:00Z";
  raw.rows[5].last_success_at = "2026-09-22T11:00:00.001Z";
  const view = parseSyncHealthView(raw);
  assert.equal(view.status, "ready");
  assert.deepEqual(
    view.rows.slice(0, 6).map((row) => row.health),
    ["syncing", "failed", "empty", "delayed", "delayed", "healthy"],
  );
  assert.equal(view.rows[5].datasetVersion, "9223372036854775807");
});

test("Cron 활성·누락·중복과 실제 수집 건강을 독립적으로 유지한다", () => {
  const raw = payload();
  raw.rows[0].has_error = true;
  raw.rows[1].active = false;
  Object.assign(raw.rows[2], {
    schedule_count: 0,
    schedule: null,
    active: null,
  });
  Object.assign(raw.rows[3], {
    schedule_count: 2,
    schedule: null,
    active: null,
  });
  raw.rows[7].has_error = true;
  const view = parseSyncHealthView(raw);
  assert.equal(view.status, "ready");
  assert.deepEqual(
    view.rows
      .slice(0, 4)
      .map(({ health, scheduleStatus }) => [health, scheduleStatus]),
    [
      ["failed", "active"],
      ["healthy", "disabled"],
      ["healthy", "missing"],
      ["healthy", "duplicate"],
    ],
  );
  assert.equal(view.rows[7].health, "failed");
  assert.equal(view.rows[8].health, "healthy");
});

test("누락·중복·알 수 없는 단위와 원시 필드 오염을 정상 목록으로 처리하지 않는다", () => {
  const missing = payload();
  missing.rows.pop();
  const duplicate = payload();
  duplicate.rows[1] = { ...duplicate.rows[0] };
  const unknown = payload();
  unknown.rows[0].key = "other";
  const leaked = payload();
  Object.assign(leaked.rows[0], { last_error: "비공개 오류" });
  const missingField = payload();
  const { has_error: ignored, ...withoutError } = missingField.rows[0];
  void ignored;
  const malformed = {
    ...missingField,
    rows: [withoutError, ...missingField.rows.slice(1)],
  };
  for (const raw of [missing, duplicate, unknown, leaked, malformed]) {
    assert.deepEqual(parseSyncHealthView(raw), {
      status: "error",
      checkedAt: null,
      rows: [],
    });
  }
});

test("미래·잘못된 날짜·시간대 누락과 유효하지 않은 lease 근거를 거부한다", () => {
  for (const [field, value] of [
    ["last_success_at", "2026-09-22T12:00:01Z"],
    ["last_attempt_at", "2026-09-22T12:00:01Z"],
    ["last_success_at", "2026-02-30T00:00:00Z"],
    ["last_success_at", "2026-09-22T11:00:00"],
    ["lease_until", "infinity"],
  ]) {
    const raw = payload();
    Object.assign(raw.rows[0], { [field]: value });
    assert.equal(
      parseSyncHealthView(raw).status,
      "error",
      `${field}: ${value}`,
    );
  }
  const raw = payload();
  Object.assign(raw.rows[0], {
    lease_until: "2026-09-22T12:01:00Z",
    last_attempt_at: null,
  });
  assert.equal(parseSyncHealthView(raw).status, "error");
});

test("중복 Cron의 임의 선택과 bigint 숫자 변환·범위 초과를 거부한다", () => {
  for (const patch of [
    { schedule_count: 2 },
    { schedule_count: -1 },
    { dataset_version: 9007199254740992 },
    { dataset_version: "9223372036854775808" },
    { has_error: "false" },
  ]) {
    const raw = payload();
    Object.assign(raw.rows[0], patch);
    assert.equal(parseSyncHealthView(raw).status, "error");
  }
});
