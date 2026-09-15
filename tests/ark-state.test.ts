import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { ArkFund, ArkSnapshot } from "../src/domain/ark";

const hash = (character: string) => character.repeat(64);
const originalNames = {
  ARKK: "ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv",
  ARKQ: "ARK_AUTONOMOUS_TECH._&_ROBOTICS_ETF_ARKQ_HOLDINGS.csv",
};
function snapshot(
  fund: "ARKK" | "ARKQ",
  value = "100.01",
  reportDate = "2025-01-06",
): Omit<ArkSnapshot, "version"> {
  return {
    fund,
    reportDate,
    sourceUrl: `https://www.ark-funds.com/funds/${fund.toLowerCase()}`,
    holdingsUrl: `https://assets.ark-funds.com/fund-documents/funds-etf-csv/${originalNames[fund]}`,
    holdings: [
      {
        id: "cash",
        company: "Cash fund",
        ticker: null,
        identifier: "X9USDGSFT",
        shares: "10.25",
        valueUsd: value,
        weightPercent: "100",
      },
    ],
  };
}

async function database() {
  const db = new PGlite();
  // 실제 Supabase에는 연결하지 않는다. 기존 Stanley 마이그레이션 위에 ARK를 추가하는 경계를 재현한다.
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects(bucket_id text); alter table storage.objects enable row level security;",
  );
  for (const name of ["202609140001_stanley.sql", "202609150001_ark.sql"]) {
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  }
  return db;
}
async function acquire(db: PGlite, fund: ArkFund) {
  return (
    await db.query<{ token: string | null }>(
      "select public.ark_acquire($1) as token",
      [fund],
    )
  ).rows[0].token;
}
async function nextAttempt(db: PGlite, fund: ArkFund) {
  await db.query(
    "update public.ark_state set last_attempt_at=now()-interval '2 minutes' where fund=$1",
    [fund],
  );
}
async function commit(
  db: PGlite,
  fund: ArkFund,
  token: string | null,
  data: unknown,
  documentHash: string,
  normalizedHash: string,
) {
  return (
    await db.query<{ result: string }>(
      "select public.ark_commit($1,$2,$3::jsonb,$4,$5,$6) as result",
      [
        fund,
        token,
        JSON.stringify(data),
        documentHash,
        normalizedHash,
        `ark/${fund}/${documentHash}`,
      ],
    )
  ).rows[0].result;
}
async function state(db: PGlite, fund: ArkFund) {
  return (
    await db.query<{
      dataset_version: number;
      current_snapshot: ArkSnapshot;
      previous_snapshot: ArkSnapshot | null;
      last_error: string | null;
    }>("select * from public.ark_state where fund=$1", [fund])
  ).rows[0];
}

test("펀드별 lease를 분리하고 센트 변경만 회전하며 오래된 실행·중복 원문 충돌은 원자적으로 보존한다", async () => {
  const db = await database();
  try {
    const tokenK = await acquire(db, "ARKK");
    const tokenQ = await acquire(db, "ARKQ");
    assert.ok(tokenK && tokenQ);
    assert.equal(await acquire(db, "ARKK"), null);
    assert.equal(
      await commit(db, "ARKK", tokenK, snapshot("ARKK"), hash("a"), hash("1")),
      "updated",
    );
    assert.equal(
      await commit(db, "ARKQ", tokenQ, snapshot("ARKQ"), hash("a"), hash("1")),
      "updated",
    );
    assert.equal(await acquire(db, "ARKK"), "cooldown");

    await nextAttempt(db, "ARKK");
    assert.equal(
      await commit(
        db,
        "ARKK",
        await acquire(db, "ARKK"),
        snapshot("ARKK", "100.01", "2025-01-07"),
        hash("b"),
        hash("1"),
      ),
      "unchanged",
    );
    assert.equal((await state(db, "ARKK")).dataset_version, 1);
    assert.equal((await state(db, "ARKK")).previous_snapshot, null);
    assert.equal(
      (await state(db, "ARKK")).current_snapshot.reportDate,
      "2025-01-07",
    );

    await nextAttempt(db, "ARKK");
    assert.equal(
      await commit(
        db,
        "ARKK",
        await acquire(db, "ARKK"),
        snapshot("ARKK", "100.02", "2025-01-07"),
        hash("c"),
        hash("2"),
      ),
      "updated",
    );
    assert.equal(
      (await state(db, "ARKK")).previous_snapshot?.holdings[0].valueUsd,
      "100.01",
    );

    await nextAttempt(db, "ARKK");
    const expired = await acquire(db, "ARKK");
    await db.exec(
      "update public.ark_state set lease_until=now()-interval '1 second',last_attempt_at=now()-interval '2 minutes' where fund='ARKK'",
    );
    const owner = await acquire(db, "ARKK");
    const changed = snapshot("ARKK", "100.03", "2025-01-08");
    assert.equal(
      await commit(db, "ARKK", expired, changed, hash("d"), hash("3")),
      "busy",
    );
    assert.equal(
      (await state(db, "ARKK")).current_snapshot.holdings[0].valueUsd,
      "100.02",
    );
    assert.equal(
      await commit(db, "ARKK", owner, changed, hash("d"), hash("3")),
      "updated",
    );

    await nextAttempt(db, "ARKK");
    const collision = await acquire(db, "ARKK");
    await assert.rejects(
      commit(
        db,
        "ARKK",
        collision,
        snapshot("ARKK", "100.04", "2025-01-08"),
        hash("a"),
        hash("4"),
      ),
    );
    assert.equal((await state(db, "ARKK")).dataset_version, 3);
    assert.equal(
      (await state(db, "ARKK")).current_snapshot.holdings[0].valueUsd,
      "100.03",
    );
    const events = await db.query<{ dataset_version: number }>(
      "select dataset_version from public.ark_events where fund='ARKK' order by dataset_version",
    );
    assert.deepEqual(
      events.rows.map((row) => row.dataset_version),
      [1, 2, 3],
    );
    assert.equal((await state(db, "ARKQ")).dataset_version, 1);
    assert.equal(
      (await state(db, "ARKQ")).current_snapshot.holdings[0].valueUsd,
      "100.01",
    );

    await db.query("select public.ark_fail($1,$2,$3)", [
      "ARKK",
      collision,
      "unrecognized upstream diagnostic",
    ]);
    assert.equal((await state(db, "ARKK")).last_error, "SYNC_FAILED");
    assert.equal((await state(db, "ARKK")).dataset_version, 3);
  } finally {
    await db.close();
  }
});

test("잘못된 펀드·미래 날짜·숫자 JSON·이전 기준일은 저장하지 않고 정규화된 음수 수량은 보존한다", async () => {
  const db = await database();
  try {
    const token = await acquire(db, "ARKK");
    const original = snapshot("ARKK");
    await assert.rejects(
      commit(db, "ARKK", token, snapshot("ARKQ"), hash("a"), hash("1")),
    );
    await assert.rejects(
      commit(
        db,
        "ARKK",
        token,
        {
          ...original,
          reportDate: new Date(Date.now() + 7 * 86_400_000)
            .toISOString()
            .slice(0, 10),
        },
        hash("a"),
        hash("1"),
      ),
    );
    await assert.rejects(
      commit(
        db,
        "ARKK",
        token,
        {
          ...original,
          holdings: [{ ...original.holdings[0], valueUsd: 100.01 }],
        },
        hash("a"),
        hash("1"),
      ),
    );
    const signed = {
      ...original,
      holdings: [{ ...original.holdings[0], shares: "-1.25" }],
    };
    assert.equal(
      await commit(db, "ARKK", token, signed, hash("a"), hash("1")),
      "updated",
    );
    assert.equal(
      (await state(db, "ARKK")).current_snapshot.holdings[0].shares,
      "-1.25",
    );
    await nextAttempt(db, "ARKK");
    await assert.rejects(
      commit(
        db,
        "ARKK",
        await acquire(db, "ARKK"),
        { ...original, reportDate: "2025-01-05" },
        hash("b"),
        hash("2"),
      ),
    );
    assert.equal((await state(db, "ARKK")).dataset_version, 1);
  } finally {
    await db.close();
  }
});

test("기존 Storage 허용 정책이 있어도 ARK 원문·캐시·RPC는 익명과 로그인 사용자에게 열리지 않는다", async () => {
  const db = await database();
  try {
    await db.exec(
      "grant usage on schema storage to anon,authenticated; grant select,insert on storage.objects to anon,authenticated; create policy broad_existing_policy on storage.objects for all to anon,authenticated using(true) with check(true); insert into storage.objects values('ark-originals'),('other-bucket');",
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from public.ark_state"));
      await assert.rejects(db.query("select public.ark_acquire('ARKK')"));
      await assert.rejects(
        db.query("insert into storage.objects values('ark-originals')"),
      );
      const visible = await db.query<{ bucket_id: string }>(
        "select bucket_id from storage.objects",
      );
      assert.deepEqual(visible.rows, [{ bucket_id: "other-bucket" }]);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal(
      await commit(
        db,
        "ARKK",
        await acquire(db, "ARKK"),
        snapshot("ARKK"),
        hash("a"),
        hash("1"),
      ),
      "updated",
    );
    assert.equal(
      (await state(db, "ARKK")).current_snapshot.holdings[0].valueUsd,
      "100.01",
    );
  } finally {
    await db.close();
  }
});
