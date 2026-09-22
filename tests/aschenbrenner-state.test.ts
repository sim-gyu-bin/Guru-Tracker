import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { SecSnapshot } from "../src/domain/sec";

/**
 * 커밋 RPC가 고정 검증하는 제출자 신원이다. 서버 설정과 독립적으로 적어 두어
 * 대상 분리 검증과 실제 설정 값이 어긋나면 이 테스트가 먼저 깨지게 한다.
 */
const MANAGERS = {
  aschenbrenner: {
    cik: "0002045724",
    archiveCik: "2045724",
    managerName: "Situational Awareness LP",
  },
  stanley: {
    cik: "0001536411",
    archiveCik: "1536411",
    managerName: "Duquesne Family Office LLC",
  },
} as const;

const stanleyMigration = new URL(
  "../supabase/migrations/202609140001_stanley.sql",
  import.meta.url,
);
const aschenbrennerMigration = new URL(
  "../supabase/migrations/202609220002_aschenbrenner.sql",
  import.meta.url,
);
const hash = (character: string) => character.repeat(64);

/**
 * 커밋 계약을 검증하는 픽스처다. 실제 13F 원문은 수집 회귀와 공식 원문 검증에서 다룬다.
 * accession은 제출 대행 접수(0000935836) 형식이며 제출자 CIK와 앞자리가 달라도 커밋되어야 한다.
 */
const filing = (
  accession: string,
  value = "100",
  reportDate = "2026-06-30",
  manager: keyof typeof MANAGERS = "aschenbrenner",
): Omit<SecSnapshot, "version"> => ({
  accession,
  cik: MANAGERS[manager].cik,
  managerName: MANAGERS[manager].managerName,
  reportDate,
  filingDate: "2026-08-14",
  form: "13F-HR",
  sourceUrl: `https://www.sec.gov/Archives/edgar/data/${MANAGERS[manager].archiveCik}/example/primary.xml`,
  informationTableUrl: `https://www.sec.gov/Archives/edgar/data/${MANAGERS[manager].archiveCik}/example/table.xml`,
  holdings: [
    {
      issuer: "Test issuer",
      titleOfClass: "SH",
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
  // Aschenbrenner 마이그레이션은 공유 버킷을 다시 만들지 않고 기존 버킷만 확인하므로 Stanley를 먼저 적용한다.
  await db.exec(await readFile(stanleyMigration, "utf8"));
  await db.exec(await readFile(aschenbrennerMigration, "utf8"));
  return db;
}

async function acquire(db: PGlite, rpc = "aschenbrenner") {
  const result = await db.query<{ token: string | null }>(
    `select public.${rpc}_acquire() as token`,
  );
  return result.rows[0].token;
}

async function allowNextAttempt(db: PGlite, rpc = "aschenbrenner") {
  // 기다리지 않고 운영자의 시계가 충분히 흐른 상황을 만든다. lease가 살아 있으면 획득은 여전히 거절돼야 한다.
  await db.exec(
    `update public.${rpc}_state set last_attempt_at = now() - interval '2 minutes'`,
  );
}

async function commit(
  db: PGlite,
  token: string | null,
  snapshot: Omit<SecSnapshot, "version">,
  documentHash: string,
  normalizedHash: string,
  rawPrefix = `aschenbrenner/${documentHash}`,
  rpc = "aschenbrenner",
) {
  const result = await db.query<{ result: string }>(
    `select public.${rpc}_commit($1,$2::jsonb,$3,$4,$5) as result`,
    [token, JSON.stringify(snapshot), documentHash, normalizedHash, rawPrefix],
  );
  return result.rows[0].result;
}

async function state(db: PGlite, rpc = "aschenbrenner") {
  const result = await db.query<{
    dataset_version: number;
    current_snapshot: SecSnapshot | null;
    previous_snapshot: SecSnapshot | null;
    last_error: string | null;
  }>(`select * from public.${rpc}_state`);
  return result.rows[0];
}

test("Aschenbrenner 회전은 실제 변경에만 일어나고 실패한 커밋은 이전 스냅샷을 보존한다", async () => {
  const db = await database();
  try {
    const firstToken = await acquire(db);
    assert.ok(firstToken);
    assert.equal(await acquire(db), null, "동시 요청은 lease를 획득할 수 없다");
    const first = filing("0000935836-26-000418");
    assert.equal(
      await commit(db, firstToken, first, hash("a"), hash("1")),
      "updated",
    );
    assert.equal((await state(db)).dataset_version, 1);
    assert.equal((await state(db)).previous_snapshot, null);

    await allowNextAttempt(db);
    // 정규화가 같으면 원문 메타데이터만 갱신하고 version·직전 스냅샷·event를 늘리지 않는다.
    const equivalent = filing("0000935836-26-000419");
    assert.equal(
      await commit(db, await acquire(db), equivalent, hash("b"), hash("1")),
      "unchanged",
    );
    assert.equal(
      (await state(db)).current_snapshot?.accession,
      equivalent.accession,
    );
    assert.equal((await state(db)).dataset_version, 1);
    assert.equal((await state(db)).previous_snapshot, null);

    // 만료된 lease 소유자는 회전하지 못하고 현재 lease 소유자만 커밋한다.
    await allowNextAttempt(db);
    const expiredToken = await acquire(db);
    await db.exec(
      "update public.aschenbrenner_state set lease_until = now() - interval '1 second', last_attempt_at = now() - interval '2 minutes'",
    );
    const ownerToken = await acquire(db);
    const changed = filing("0000935836-26-000420", "200");
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

    // 실패 코드는 허용 목록으로 축약하고 공급자 원문 메시지를 저장하지 않는다.
    await allowNextAttempt(db);
    const failedToken = await acquire(db);
    await db.query("select public.aschenbrenner_fail($1, $2)", [
      failedToken,
      "provider secret must never be stored",
    ]);
    assert.equal((await state(db)).last_error, "SYNC_FAILED");
    assert.equal((await state(db)).dataset_version, 2);
    assert.equal(
      (await state(db)).current_snapshot?.accession,
      changed.accession,
    );

    await allowNextAttempt(db);
    const invalidToken = await acquire(db);
    await assert.rejects(
      commit(
        db,
        invalidToken,
        filing("0000935836-26-000421", "100", "2026-03-31"),
        hash("d"),
        hash("3"),
      ),
      /Stale filing/,
    );
    await assert.rejects(
      commit(db, invalidToken, changed, hash("c"), hash("4")),
      /Same document normalized differently/,
    );
    // event 삽입 실패가 나도 먼저 실행된 snapshot UPDATE까지 한 transaction으로 되돌아가야 한다.
    await assert.rejects(
      commit(
        db,
        invalidToken,
        filing("0000935836-26-000422", "300"),
        hash("a"),
        hash("5"),
      ),
      /duplicate key/,
    );
    assert.equal(
      (await state(db)).current_snapshot?.accession,
      changed.accession,
    );
    const events = await db.query<{ count: number }>(
      "select count(*)::integer as count from public.aschenbrenner_events",
    );
    assert.equal(events.rows[0].count, 2);
    // Aschenbrenner 작업은 Stanley 캐시를 건드리지 않는다.
    const stanley = await state(db, "stanley");
    assert.equal(stanley.dataset_version, 0);
    assert.equal(stanley.current_snapshot, null);
  } finally {
    await db.close();
  }
});

test("다른 관리자의 스냅샷과 어긋난 원문 접두사는 Aschenbrenner 커밋에서 거부된다", async () => {
  const db = await database();
  try {
    const token = await acquire(db);
    const own = filing("0000935836-26-000418");
    // 대상 분리는 양방향이다. 각 제출자 설정은 자기 CIK·이름의 스냅샷만 받는다.
    await assert.rejects(
      commit(
        db,
        token,
        { ...own, cik: MANAGERS.stanley.cik },
        hash("a"),
        hash("1"),
      ),
      /Invalid verified snapshot/,
    );
    await assert.rejects(
      commit(
        db,
        token,
        { ...own, managerName: MANAGERS.stanley.managerName },
        hash("a"),
        hash("1"),
      ),
      /Invalid verified snapshot/,
    );
    const stanleyToken = await acquire(db, "stanley");
    await assert.rejects(
      commit(
        db,
        stanleyToken,
        own,
        hash("a"),
        hash("1"),
        `stanley/${hash("a")}`,
        "stanley",
      ),
      /Invalid verified snapshot/,
    );
    // 원문 접두사는 버킷 안에서 대상과 문서 해시를 분리한다.
    await assert.rejects(
      commit(db, token, own, hash("a"), hash("1"), `stanley/${hash("a")}`),
      /Invalid verified snapshot/,
    );
    await assert.rejects(
      commit(
        db,
        token,
        own,
        hash("a"),
        hash("1"),
        `aschenbrenner/${hash("b")}`,
      ),
      /Invalid verified snapshot/,
    );
    await assert.rejects(
      commit(db, token, { ...own, holdings: [] }, hash("a"), hash("1")),
      /Invalid verified snapshot/,
    );
    assert.equal((await state(db)).dataset_version, 0);
    assert.equal((await state(db, "stanley")).dataset_version, 0);
  } finally {
    await db.close();
  }
});

test("대상별 lease는 서로를 막지 않고 각자의 상태만 회전시킨다", async () => {
  const db = await database();
  try {
    const stanleyToken = await acquire(db, "stanley");
    assert.ok(stanleyToken);
    // 두 대상은 lease를 공유하지 않는다. 한쪽 동기화가 진행 중이어도 다른 쪽은 시작할 수 있다.
    const token = await acquire(db);
    assert.ok(
      token,
      "Stanley 동기화가 진행 중이어도 Aschenbrenner 동기화는 시작할 수 있다",
    );
    assert.equal(await acquire(db), null, "같은 대상의 중복 실행은 거절한다");
    assert.equal(
      await acquire(db, "stanley"),
      null,
      "Stanley도 자기 lease가 살아 있으면 거절한다",
    );
    const own = filing("0000935836-26-000418");
    assert.equal(await commit(db, token, own, hash("a"), hash("1")), "updated");
    // 다른 대상의 lease를 동시에 보유한 상태에서도 커밋은 자기 테이블만 회전시킨다.
    const stanley = filing(
      "0001536411-26-000006",
      "100",
      "2026-06-30",
      "stanley",
    );
    assert.equal(
      await commit(
        db,
        stanleyToken,
        stanley,
        hash("e"),
        hash("6"),
        `stanley/${hash("e")}`,
        "stanley",
      ),
      "updated",
    );
    const ownState = await state(db);
    const stanleyState = await state(db, "stanley");
    assert.equal(ownState.current_snapshot?.cik, MANAGERS.aschenbrenner.cik);
    assert.equal(
      ownState.current_snapshot?.managerName,
      MANAGERS.aschenbrenner.managerName,
    );
    assert.equal(stanleyState.current_snapshot?.cik, MANAGERS.stanley.cik);
    // 각 대상의 변경 이벤트는 자기 테이블에만 한 건씩 생긴다.
    const ownEvents = await db.query<{ count: number }>(
      "select count(*)::integer as count from public.aschenbrenner_events",
    );
    const stanleyEvents = await db.query<{ count: number }>(
      "select count(*)::integer as count from public.stanley_events",
    );
    assert.equal(ownEvents.rows[0].count, 1);
    assert.equal(stanleyEvents.rows[0].count, 1);
  } finally {
    await db.close();
  }
});

test("익명·로그인 사용자는 Aschenbrenner 캐시와 RPC에 접근하지 못하고 서버 역할만 조회할 수 있다", async () => {
  const db = await database();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select * from public.aschenbrenner_state"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select public.aschenbrenner_acquire()"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal(
      (await db.query("select * from public.aschenbrenner_state")).rows.length,
      1,
    );
    assert.ok(await acquire(db));
    await assert.rejects(
      db.exec("update public.aschenbrenner_state set dataset_version = 999"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
