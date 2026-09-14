import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { SecSnapshot } from "../src/domain/sec";

const migration = new URL(
  "../supabase/migrations/202609140001_stanley.sql",
  import.meta.url,
);
const hash = (character: string) => character.repeat(64);
const filing = (
  accession: string,
  value = "100",
  reportDate = "2026-06-30",
): Omit<SecSnapshot, "version"> => ({
  accession,
  cik: "0001536411",
  managerName: "Duquesne Family Office LLC",
  reportDate,
  filingDate: "2026-08-14",
  form: "13F-HR",
  sourceUrl:
    "https://www.sec.gov/Archives/edgar/data/1536411/example/primary.xml",
  informationTableUrl:
    "https://www.sec.gov/Archives/edgar/data/1536411/example/table.xml",
  holdings: [
    {
      issuer: "Test issuer",
      titleOfClass: "COM",
      cusip: "123456789",
      valueUsd: value,
      shares: "10",
      shareType: "SH",
      putCall: null,
    },
  ],
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
    "select public.stanley_acquire() as token",
  );
  return result.rows[0].token;
}

async function allowNextAttempt(db: PGlite) {
  // 기다리지 않고 운영자의 시계가 충분히 흐른 상황을 만든다. lease가 살아 있으면 획득은 여전히 거절돼야 한다.
  await db.exec(
    "update public.stanley_state set last_attempt_at = now() - interval '2 minutes'",
  );
}

async function commit(
  db: PGlite,
  token: string | null,
  snapshot: Omit<SecSnapshot, "version">,
  documentHash: string,
  normalizedHash: string,
) {
  const result = await db.query<{ result: string }>(
    "select public.stanley_commit($1,$2::jsonb,$3,$4,$5) as result",
    [
      token,
      JSON.stringify(snapshot),
      documentHash,
      normalizedHash,
      `stanley/${documentHash}`,
    ],
  );
  return result.rows[0].result;
}

async function state(db: PGlite) {
  const result = await db.query<{
    dataset_version: number;
    current_snapshot: SecSnapshot;
    previous_snapshot: SecSnapshot | null;
    last_error: string | null;
  }>("select * from public.stanley_state");
  return result.rows[0];
}

test("스냅샷 회전은 실제 변경에만 일어나며 중복·실패·오래된 펜스는 기존 공시를 보존한다", async () => {
  const db = await database();
  try {
    const firstToken = await acquire(db);
    assert.ok(firstToken);
    assert.equal(await acquire(db), null, "동시 요청은 lease를 획득할 수 없다");
    const first = filing("0001536411-26-000006");
    assert.equal(
      await commit(db, firstToken, first, hash("a"), hash("1")),
      "updated",
    );
    assert.equal((await state(db)).dataset_version, 1);
    assert.equal((await state(db)).previous_snapshot, null);
    assert.equal(
      await acquire(db),
      "cooldown",
      "성공 직후 재요청도 cooldown으로 제한한다",
    );

    await allowNextAttempt(db);
    assert.equal(
      await commit(db, await acquire(db), first, hash("a"), hash("1")),
      "unchanged",
    );
    const equivalent = filing("0001536411-26-000007");
    await allowNextAttempt(db);
    assert.equal(
      await commit(db, await acquire(db), equivalent, hash("b"), hash("1")),
      "unchanged",
    );
    assert.equal(
      (await state(db)).current_snapshot.accession,
      equivalent.accession,
    );
    assert.equal((await state(db)).dataset_version, 1);
    assert.equal((await state(db)).previous_snapshot, null);

    await allowNextAttempt(db);
    const expiredToken = await acquire(db);
    await db.exec(
      "update public.stanley_state set lease_until = now() - interval '1 second', last_attempt_at = now() - interval '2 minutes'",
    );
    const ownerToken = await acquire(db);
    const changed = filing("0001536411-26-000008", "200");
    assert.equal(
      await commit(db, expiredToken, changed, hash("c"), hash("2")),
      "busy",
    );
    assert.equal((await state(db)).dataset_version, 1);
    assert.equal(
      await commit(db, ownerToken, changed, hash("c"), hash("2")),
      "updated",
    );
    assert.equal((await state(db)).dataset_version, 2);
    assert.equal(
      (await state(db)).previous_snapshot?.accession,
      equivalent.accession,
    );

    await allowNextAttempt(db);
    const failedToken = await acquire(db);
    await db.query("select public.stanley_fail($1, $2)", [
      failedToken,
      "provider secret must never be stored",
    ]);
    assert.equal((await state(db)).last_error, "SYNC_FAILED");
    assert.equal(
      (await state(db)).current_snapshot.accession,
      changed.accession,
    );
    assert.equal((await state(db)).dataset_version, 2);
    assert.equal(
      await acquire(db),
      "cooldown",
      "실패 직후의 자동 재시도 폭주를 제한한다",
    );

    await allowNextAttempt(db);
    const invalidToken = await acquire(db);
    await assert.rejects(
      commit(
        db,
        invalidToken,
        filing("0001536411-26-000009", "100", "2026-03-31"),
        hash("d"),
        hash("3"),
      ),
      /Stale filing/,
    );
    await assert.rejects(
      commit(db, invalidToken, changed, hash("c"), hash("4")),
      /Same document normalized differently/,
    );
    assert.equal((await state(db)).dataset_version, 2);

    // 이벤트 삽입 실패가 발생해도 먼저 실행된 snapshot UPDATE까지 한 transaction으로 되돌아가야 한다.
    await assert.rejects(
      commit(
        db,
        invalidToken,
        filing("0001536411-26-000010", "300"),
        hash("a"),
        hash("5"),
      ),
      /duplicate key/,
    );
    assert.equal(
      (await state(db)).current_snapshot.accession,
      changed.accession,
    );
    const events = await db.query<{ count: number }>(
      "select count(*)::integer as count from public.stanley_events",
    );
    assert.equal(events.rows[0].count, 2);
  } finally {
    await db.close();
  }
});

test("익명·로그인 사용자는 캐시와 RPC에 접근하지 못하고 서버 역할만 조회·동기화할 수 있다", async () => {
  const db = await database();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select * from public.stanley_state"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select public.stanley_acquire()"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal(
      (await db.query("select * from public.stanley_state")).rows.length,
      1,
    );
    assert.ok(await acquire(db));
    await assert.rejects(
      db.exec("update public.stanley_state set dataset_version = 999"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
