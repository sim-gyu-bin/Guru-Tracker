import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  HOUSE_PTR_FILER_NAME,
  HOUSE_PTR_FILER_STATUS,
  type HousePtrSnapshot,
} from "../src/domain/house";

/**
 * PTR 캐시의 lease·스냅샷 회전 불변 조건을 인메모리 PostgreSQL에서 검증한다.
 *
 * 실제 Supabase에는 연결하지 않는다. 펜싱 토큰·cooldown·문서 동일성 판정·직전 스냅샷 회전·
 * 오래된 제출 거부가 깨지면 기존에 검증해 둔 PTR이 잘못 덮이므로 그 지점만 확인한다.
 */

const migration = new URL(
  "../supabase/migrations/202609160001_house_ptr.sql",
  import.meta.url,
);
const hash = (character: string) => character.repeat(64);

/** 검증을 통과한 형태의 스냅샷. 회전 규칙만 보려는 시험이므로 거래 행은 한 건이면 충분하다. */
const filing = (
  documentId: string,
  filingDate: string,
  overrides: Partial<Omit<HousePtrSnapshot, "version">> = {},
): Omit<HousePtrSnapshot, "version"> => ({
  documentId,
  filerName: HOUSE_PTR_FILER_NAME,
  filerStatus: HOUSE_PTR_FILER_STATUS,
  stateDistrict: "CA11",
  filingDate,
  signedAt: filingDate,
  sourceUrl: `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${filingDate.slice(0, 4)}/${documentId}.pdf`,
  indexUrl: `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${filingDate.slice(0, 4)}FD.zip`,
  transactions: [
    {
      asset: "Bloom Energy Corporation Class A Common Stock (BE)",
      assetTypeCode: "ST",
      transactionType: "P",
      transactionDate: "2026-07-24",
      notificationDate: "2026-07-24",
      amountRange: "$1,000,001 - $5,000,000",
      ownerCode: "SP",
      filingStatus: null,
      details: ["D: Purchased 10,000 shares."],
    },
  ],
  ...overrides,
});

async function database() {
  const db = new PGlite();
  // Supabase 관리 스키마의 최소 경계만 재현한다. 실제 프로젝트나 Storage 서비스에는 연결하지 않는다.
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects(bucket_id text); alter table storage.objects enable row level security;",
  );
  await db.exec(await readFile(migration, "utf8"));
  return db;
}

async function acquire(db: PGlite) {
  const result = await db.query<{ token: string | null }>(
    "select public.house_ptr_acquire() as token",
  );
  return result.rows[0].token;
}

async function allowNextAttempt(db: PGlite) {
  // 기다리지 않고 운영자의 시계가 충분히 흐른 상황을 만든다. lease가 살아 있으면 획득은 여전히 거절돼야 한다.
  await db.exec(
    "update public.house_ptr_state set last_attempt_at = now() - interval '2 minutes'",
  );
}

async function commit(
  db: PGlite,
  token: string | null,
  snapshot: Omit<HousePtrSnapshot, "version">,
  documentHash: string,
  normalizedHash: string,
) {
  const result = await db.query<{ result: string }>(
    "select public.house_ptr_commit($1,$2::jsonb,$3,$4,$5) as result",
    [
      token,
      JSON.stringify(snapshot),
      documentHash,
      normalizedHash,
      `house/${documentHash}`,
    ],
  );
  return result.rows[0].result;
}

async function fail(db: PGlite, token: string | null, error: string) {
  const result = await db.query<{ result: boolean }>(
    "select public.house_ptr_fail($1,$2) as result",
    [token, error],
  );
  return result.rows[0].result;
}

async function state(db: PGlite) {
  const result = await db.query<{
    dataset_version: number;
    current_snapshot: HousePtrSnapshot;
    previous_snapshot: HousePtrSnapshot | null;
    last_error: string | null;
    lease_until: string | null;
  }>("select * from public.house_ptr_state");
  return result.rows[0];
}

async function eventCount(db: PGlite) {
  const result = await db.query<{ count: number }>(
    "select count(*)::integer as count from public.house_ptr_events",
  );
  return result.rows[0].count;
}

test("PTR 스냅샷은 검증된 새 문서에만 회전하고 오래된 제출·다른 펜스는 기존 내용을 보존한다", async () => {
  const db = await database();
  try {
    const firstToken = await acquire(db);
    assert.ok(firstToken);
    assert.equal(await acquire(db), null, "동시 요청은 lease를 획득할 수 없다");

    const first = filing("20035143", "2026-08-21");
    assert.equal(
      await commit(db, firstToken, first, hash("a"), hash("1")),
      "updated",
    );
    assert.equal((await state(db)).dataset_version, 1);
    assert.equal((await state(db)).previous_snapshot, null);
    assert.equal((await state(db)).current_snapshot.version, 1);
    assert.equal((await state(db)).last_error, null);
    assert.equal((await state(db)).lease_until, null);
    assert.equal(await eventCount(db), 1);
    assert.equal(
      await acquire(db),
      "cooldown",
      "성공 직후 재요청도 cooldown으로 제한한다",
    );

    await allowNextAttempt(db);
    assert.equal(
      await commit(db, await acquire(db), first, hash("a"), hash("1")),
      "unchanged",
      "같은 문서·같은 정규화 데이터는 회전하지 않는다",
    );
    assert.equal((await state(db)).dataset_version, 1);
    assert.equal((await state(db)).previous_snapshot, null);
    assert.equal(await eventCount(db), 1);

    await allowNextAttempt(db);
    const second = filing("20035144", "2026-08-22");
    assert.equal(
      await commit(db, await acquire(db), second, hash("b"), hash("2")),
      "updated",
    );
    assert.equal((await state(db)).dataset_version, 2);
    assert.equal((await state(db)).current_snapshot.version, 2);
    assert.equal(
      (await state(db)).previous_snapshot?.documentId,
      "20035143",
      "직전 스냅샷은 방금 밀려난 문서다",
    );
    assert.equal(await eventCount(db), 2);

    await allowNextAttempt(db);
    const heldToken = await acquire(db);
    await assert.rejects(
      commit(
        db,
        heldToken,
        filing("20035140", "2026-07-01"),
        hash("c"),
        hash("3"),
      ),
      /Stale filing/,
      "제출일·문서번호가 뒤진 문서는 반영하지 않는다",
    );
    await assert.rejects(
      commit(db, heldToken, second, hash("b"), hash("4")),
      /Same document normalized differently/,
      "같은 문서의 정규화 결과가 달라지면 조용히 덮지 않는다",
    );
    await assert.rejects(
      commit(
        db,
        heldToken,
        filing("20035145", "2026-08-23", { filerName: "다른 사람" }),
        hash("e"),
        hash("5"),
      ),
      /Invalid verified snapshot/,
      "원문에서 대조하지 않은 값은 DB가 거부한다",
    );
    assert.equal((await state(db)).dataset_version, 2);
    assert.equal((await state(db)).current_snapshot.documentId, "20035144");
    assert.equal(await eventCount(db), 2);

    // 펜싱 토큰이 다른 실행은 커밋·실패 기록 모두 남기지 못한다.
    assert.equal(
      await commit(db, "999999", second, hash("b"), hash("2")),
      "busy",
    );
    assert.equal(await fail(db, "999999", "HOUSE_ACCESS"), false);
    assert.equal((await state(db)).last_error, null);

    await db.exec(
      "update public.house_ptr_state set lease_until = now() - interval '1 second', last_attempt_at = now() - interval '2 minutes'",
    );
    const ownerToken = await acquire(db);
    assert.equal(
      await commit(db, heldToken, second, hash("b"), hash("2")),
      "busy",
      "만료된 lease 소유자의 늦은 커밋은 차단한다",
    );
    assert.equal(
      await commit(
        db,
        heldToken,
        filing("20035146", "2026-08-24"),
        hash("f"),
        hash("6"),
      ),
      "busy",
      "만료 실행은 유효 소유자가 대기 중인 동안 아무 값도 바꾸지 못한다",
    );
    assert.equal(await fail(db, heldToken, "HOUSE_ACCESS"), false);
    assert.equal(
      await commit(
        db,
        ownerToken,
        filing("20035146", "2026-08-24"),
        hash("f"),
        hash("6"),
      ),
      "updated",
    );
    assert.equal((await state(db)).dataset_version, 3);
    assert.equal((await state(db)).current_snapshot.version, 3);
    assert.equal((await state(db)).previous_snapshot?.documentId, "20035144");

    await allowNextAttempt(db);
    assert.equal(
      await fail(db, await acquire(db), "provider secret must never be stored"),
      true,
    );
    assert.equal(
      (await state(db)).last_error,
      "SYNC_FAILED",
      "공급자 원문 문자열은 허용 코드로 축약한다",
    );
    assert.equal((await state(db)).lease_until, null);
    assert.equal(
      (await state(db)).current_snapshot.documentId,
      "20035146",
      "실패 기록은 기존 스냅샷을 건드리지 않는다",
    );
  } finally {
    await db.close();
  }
});
