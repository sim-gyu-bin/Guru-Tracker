import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  isAdminRow,
  parseAccessAction,
  parseRevision,
  type RouteFacts,
  routeFor,
  safeInternalPath,
  verifiedGoogleIdentity,
} from "../src/domain/access";

const migration = new URL(
  "../supabase/migrations/202609180001_access_approval.sql",
  import.meta.url,
);
// 관리자 주소는 실제 값이 아니라 테스트 전용 더미다. 운영 주소는 저장소·로그에 남기지 않는다.
const ownerEmail = "owner@example.com";
const ADMIN = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const THIRD = "44444444-4444-4444-8444-444444444444";
const FOURTH = "55555555-5555-4555-8555-555555555555";
const FIFTH = "66666666-6666-4666-8666-666666666666";
const SIXTH = "77777777-7777-4777-8777-777777777777";

type AccountOptions = {
  confirmed?: boolean;
  provider?: string;
  identityEmail?: string;
  identityVerified?: boolean;
};

async function database() {
  const db = new PGlite();
  // Supabase 관리 스키마의 최소 경계만 재현한다. auth는 마이그레이션이 신원을 확인할 때만 쓴다.
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz); create table auth.identities(id text primary key, user_id uuid not null, provider text not null, identity_data jsonb not null);",
  );
  await db.exec(await readFile(migration, "utf8"));
  return db;
}

async function account(
  db: PGlite,
  userId: string,
  email: string,
  options: AccountOptions = {},
) {
  const provider = options.provider ?? "google";
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values ($1,$2,$3)",
    [
      userId,
      email,
      options.confirmed === false ? null : "2026-09-18T00:00:00Z",
    ],
  );
  await db.query(
    "insert into auth.identities(id,user_id,provider,identity_data) values ($1,$2,$3,$4::jsonb)",
    [
      `${userId}:${provider}`,
      userId,
      provider,
      JSON.stringify({
        email: options.identityEmail ?? email,
        email_verified: options.identityVerified ?? true,
      }),
    ],
  );
}

/**
 * 가입 요청 제출. DB는 이 호출이 행을 처음 만들었는지(`created`)와 현재 행(`user`)을 함께
 * 돌려준다. `created`가 true일 때만 관리자 알림을 보내므로 최초 여부를 그대로 노출한다.
 */
async function submit(db: PGlite, userId: string, email: string) {
  const result = await db.query<{
    payload: { created: boolean; user: { status: string; revision: number } };
  }>("select public.access_request_submit($1,$2) as payload", [userId, email]);
  return result.rows[0].payload;
}

async function confirmAdmin(db: PGlite, userId: string, adminEmail: string) {
  const result = await db.query<{ result: string }>(
    "select public.access_confirm_admin($1,$2) as result",
    [userId, adminEmail],
  );
  return result.rows[0].result;
}

/**
 * 관리자 결정 호출. action과 revision에 null을 넘겨 함수의 인자 검증도 함께 확인한다.
 * null은 타입 추론이 실패하지 않도록 명시적으로 캐스팅한다.
 */
async function decide(
  db: PGlite,
  actor: string | null,
  target: string,
  action: string | null,
  revision: number | null,
) {
  const result = await db.query<{ result: string }>(
    "select public.access_decide($1::uuid,$2::uuid,$3::text,$4::bigint) as result",
    [actor, target, action, revision],
  );
  return result.rows[0].result;
}

async function row(db: PGlite, userId: string) {
  const result = await db.query<{
    email: string;
    status: string;
    is_admin: boolean;
    revision: number;
    decided_by: string | null;
  }>(
    "select email,status,is_admin,revision,decided_by from public.access_users where user_id=$1",
    [userId],
  );
  return result.rows[0] ?? null;
}

async function rowCount(db: PGlite) {
  const result = await db.query<{ count: number }>(
    "select count(*)::integer as count from public.access_users",
  );
  return result.rows[0].count;
}

/** 관리자 한 명을 세운 상태로 시작하는 테스트가 많아 준비 과정을 한곳에 둔다. */
async function withAdmin(db: PGlite) {
  await account(db, ADMIN, ownerEmail);
  await submit(db, ADMIN, ownerEmail);
  assert.equal(await confirmAdmin(db, ADMIN, ownerEmail), "admin");
}

test("관리자 승격은 확인된 Google 신원에만 일어나고 소유자는 한 명만 존재한다", async () => {
  const db = await database();
  try {
    await withAdmin(db);
    // 승격은 상태를 approved로 올리고 결정자로 자기 자신을 남긴다.
    assert.equal((await row(db, ADMIN))?.is_admin, true);
    assert.equal((await row(db, ADMIN))?.status, "approved");
    assert.equal((await row(db, ADMIN))?.decided_by, ADMIN);

    // 관리자 주소 설정이 비어 있으면 승격을 시도조차 하지 않는다.
    assert.equal(await confirmAdmin(db, ADMIN, "   "), "unconfigured");

    // Google이 아닌 provider, 확인되지 않은 identity, 미확인 계정, 이메일이 어긋난 identity는
    // 승격되지 않는다. 호출자가 넘긴 user id·이메일만 믿지 않고 auth 표를 직접 확인한 결과다.
    await account(db, OTHER, "other@example.com", { provider: "github" });
    await submit(db, OTHER, "other@example.com");
    assert.equal(
      await confirmAdmin(db, OTHER, "other@example.com"),
      "unverified",
    );

    await account(db, MEMBER, "member@example.com", {
      identityVerified: false,
    });
    await submit(db, MEMBER, "member@example.com");
    assert.equal(
      await confirmAdmin(db, MEMBER, "member@example.com"),
      "unverified",
    );

    await account(db, THIRD, "third@example.com", { confirmed: false });
    await submit(db, THIRD, "third@example.com");
    assert.equal(
      await confirmAdmin(db, THIRD, "third@example.com"),
      "unverified",
    );

    await account(db, FOURTH, "fourth@example.com", {
      identityEmail: "alias@example.com",
    });
    await submit(db, FOURTH, "fourth@example.com");
    assert.equal(
      await confirmAdmin(db, FOURTH, "fourth@example.com"),
      "unverified",
    );
    assert.equal((await row(db, FOURTH))?.is_admin, false);

    // 확인된 Google 계정이어도 두 번째 관리자는 만들지 않는다.
    await account(db, FIFTH, "fifth@example.com");
    await submit(db, FIFTH, "fifth@example.com");
    assert.equal(
      await confirmAdmin(db, FIFTH, "fifth@example.com"),
      "admin_exists",
    );
    assert.equal((await row(db, FIFTH))?.is_admin, false);
    assert.equal((await row(db, FIFTH))?.status, "pending");

    // 승인 표를 직접 고쳐도 관리자는 둘이 될 수 없고, 같은 이메일로 행을 둘 만들 수도 없다.
    await assert.rejects(
      db.query(
        "update public.access_users set is_admin=true where user_id=$1",
        [FIFTH],
      ),
      /duplicate key|unique/i,
    );
    await account(db, SIXTH, ownerEmail);
    await assert.rejects(
      submit(db, SIXTH, ownerEmail),
      /duplicate key|unique/i,
    );
  } finally {
    await db.close();
  }
});

test("가입 요청은 멱등이고 거절·해제는 재로그인으로 풀리지 않는다", async () => {
  const db = await database();
  try {
    await account(db, MEMBER, "member@example.com");
    await withAdmin(db);

    const first = await submit(db, MEMBER, "Member@Example.com");
    assert.equal(first.created, true, "최초 제출만 관리자 알림 대상이다");
    assert.equal(first.user.status, "pending");
    const again = await submit(db, MEMBER, "member@example.com");
    assert.equal(again.created, false, "재로그인은 알림을 다시 만들지 않는다");
    assert.equal(again.user.revision, 0);
    assert.equal(
      await rowCount(db),
      2,
      "같은 사용자의 재로그인은 새 행을 만들지 않는다",
    );

    // 표시 신원이 바뀌면 관리자가 보던 대상이 달라지므로 이전 승인 메일의 의도를 무효화한다.
    const renamed = await submit(db, MEMBER, "renamed@example.com");
    assert.equal(renamed.created, false);
    assert.equal(renamed.user.revision, 1);
    assert.equal((await row(db, MEMBER))?.email, "renamed@example.com");

    assert.equal(await decide(db, ADMIN, MEMBER, "approve", 1), "updated");
    assert.equal(
      (await submit(db, MEMBER, "renamed@example.com")).user.revision,
      2,
    );

    // 해제된 계정은 다시 로그인해도 승인 대기로 돌아가지 않고 알림도 만들지 않는다.
    assert.equal(await decide(db, ADMIN, MEMBER, "revoke", 2), "updated");
    const afterRevoke = await submit(db, MEMBER, "renamed@example.com");
    assert.equal(
      afterRevoke.created,
      false,
      "해제된 계정의 재로그인도 알림을 만들지 않는다",
    );
    assert.equal(afterRevoke.user.status, "revoked");
    assert.equal(afterRevoke.user.revision, 3);

    // 거절도 같다. 재승인은 관리자 결정으로만 이뤄진다.
    await account(db, THIRD, "third@example.com");
    await submit(db, THIRD, "third@example.com");
    assert.equal(await decide(db, ADMIN, THIRD, "reject", 0), "updated");
    const afterReject = await submit(db, THIRD, "third@example.com");
    assert.equal(afterReject.created, false);
    assert.equal(afterReject.user.status, "rejected");
    assert.equal(await decide(db, ADMIN, THIRD, "approve", 1), "updated");
    assert.equal((await row(db, THIRD))?.status, "approved");
  } finally {
    await db.close();
  }
});

test("겹쳐 도착한 콜백도 관리자 알림 대상(created)을 한 번만 만든다", async () => {
  const db = await database();
  try {
    await account(db, MEMBER, "member@example.com");

    const results = await Promise.all([
      submit(db, MEMBER, "member@example.com"),
      submit(db, MEMBER, "member@example.com"),
    ]);
    assert.equal(results.filter((r) => r.created).length, 1);
    assert.equal(await rowCount(db), 1);
    assert.equal((await row(db, MEMBER))?.status, "pending");
    assert.equal((await row(db, MEMBER))?.revision, 0);
  } finally {
    await db.close();
  }
});

test("결정 함수는 잘못된 인자와 오래된 revision을 상태 변화 없이 거부한다", async () => {
  const db = await database();
  try {
    await account(db, MEMBER, "member@example.com");
    await withAdmin(db);
    await submit(db, MEMBER, "member@example.com");

    // action이 null이면 `not in`이 null로 평가되어 거절 결정으로 흘러갈 수 있었다. 대소문자와
    // 알 수 없는 action도 같은 이유로 거부하고, 거부된 호출은 상태와 revision을 건드리지 않는다.
    for (const action of [null, "", "APPROVE", "delete"]) {
      assert.equal(await decide(db, ADMIN, MEMBER, action, 0), "invalid");
    }
    assert.equal(await decide(db, ADMIN, MEMBER, "approve", null), "invalid");
    assert.equal((await row(db, MEMBER))?.status, "pending");
    assert.equal((await row(db, MEMBER))?.revision, 0);
    assert.equal((await row(db, MEMBER))?.decided_by, null);

    assert.equal(await decide(db, ADMIN, MEMBER, "approve", 0), "updated");
    // 같은 메일 링크를 다시 눌러도(같은 revision) 상태를 다시 쓰지 않는다.
    assert.equal(await decide(db, ADMIN, MEMBER, "approve", 0), "stale");
    assert.equal((await row(db, MEMBER))?.revision, 1);
    // 승인 직후 만들어진 메일이 해제 뒤에 다시 실행돼도 권한을 되살리지 않는다.
    assert.equal(await decide(db, ADMIN, MEMBER, "revoke", 1), "updated");
    assert.equal(await decide(db, ADMIN, MEMBER, "approve", 1), "stale");
    assert.equal(await decide(db, ADMIN, MEMBER, "approve", 9), "stale");
    assert.equal((await row(db, MEMBER))?.status, "revoked");
    assert.equal((await row(db, MEMBER))?.revision, 2);

    // 실제 ABA: 승인 → 해제 → 재승인으로 상태 문자열이 다시 `approved`가 되어도 revision은
    // 앞서간다. 상태만 대조하는 구현이면 과거 승인 메일의 해제 요청이 최신 승인을 덮는다.
    assert.equal(await decide(db, ADMIN, MEMBER, "approve", 2), "updated");
    assert.equal((await row(db, MEMBER))?.status, "approved");
    assert.equal(await decide(db, ADMIN, MEMBER, "approve", 1), "stale");
    assert.equal(await decide(db, ADMIN, MEMBER, "revoke", 1), "stale");
    assert.equal((await row(db, MEMBER))?.status, "approved");
    assert.equal((await row(db, MEMBER))?.revision, 3);
  } finally {
    await db.close();
  }
});

test("결정은 승인된 관리자만 실행하고 관리자 자신의 권한은 해제할 수 없다", async () => {
  const db = await database();
  try {
    await account(db, MEMBER, "member@example.com");
    await account(db, OTHER, "other@example.com");
    await withAdmin(db);
    await submit(db, MEMBER, "member@example.com");
    await submit(db, OTHER, "other@example.com");

    // 미승인·미확인·알 수 없는 행위자는 결정을 실행하지 못한다.
    assert.equal(await decide(db, MEMBER, OTHER, "approve", 0), "forbidden");
    assert.equal(await decide(db, null, OTHER, "approve", 0), "invalid");
    assert.equal(await decide(db, ADMIN, THIRD, "approve", 0), "missing");
    // 승인 전에는 해제할 수 없고, 소유자는 자기 권한을 해제할 수 없다.
    assert.equal(await decide(db, ADMIN, OTHER, "revoke", 0), "invalid");
    assert.equal(await decide(db, ADMIN, ADMIN, "revoke", 1), "self");
    assert.equal((await row(db, ADMIN))?.status, "approved");

    assert.equal(await decide(db, ADMIN, MEMBER, "approve", 0), "updated");
    assert.equal(await decide(db, ADMIN, MEMBER, "revoke", 1), "updated");
    assert.equal((await row(db, MEMBER))?.status, "revoked");
    // 같은 상태로 끝나는 결정은 revision을 다시 쓰지 않는다.
    assert.equal(await decide(db, ADMIN, MEMBER, "reject", 2), "updated");
    assert.equal(await decide(db, ADMIN, MEMBER, "reject", 3), "unchanged");
    assert.equal((await row(db, MEMBER))?.revision, 3);
    // 승인된 일반 사용자도 관리자 결정을 실행할 수 없다. 바로 위에서 MEMBER를 거절 상태로
    // 끝냈으므로 먼저 재승인해 '승인된 일반 사용자' 조건을 실제로 만든 뒤 확인한다.
    assert.equal(await decide(db, ADMIN, MEMBER, "approve", 3), "updated");
    assert.equal((await row(db, MEMBER))?.status, "approved");
    assert.equal(await decide(db, MEMBER, OTHER, "approve", 0), "forbidden");
    assert.equal((await row(db, OTHER))?.status, "pending");
    assert.equal((await row(db, OTHER))?.revision, 0);
  } finally {
    await db.close();
  }
});

test("브라우저 역할은 접근 표와 결정 함수에 도달하지 못하고 서버 역할도 표를 직접 고치지 못한다", async () => {
  const db = await database();
  try {
    await account(db, MEMBER, "member@example.com");
    await withAdmin(db);

    // 실제 역할로 전환해 거부가 권한 오류로 일어나는지 확인한다. 브라우저 역할이 읽거나 실행할 수
    // 있는 표면이 곧 승인 우회 경로이므로, 검사는 권한 플래그가 아니라 실제 호출로 한다.
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(
          db.query("select status from public.access_users"),
          /permission denied/i,
          `${role}은 접근 표를 읽을 수 없다`,
        );
        await assert.rejects(
          db.query("select public.access_decide($1,$2,$3,$4::bigint)", [
            ADMIN,
            MEMBER,
            "approve",
            0,
          ]),
          /permission denied/i,
          `${role}은 결정 함수를 실행할 수 없다`,
        );
        await assert.rejects(
          db.query("select public.access_request_submit($1,$2)", [
            MEMBER,
            "member@example.com",
          ]),
          /permission denied/i,
          `${role}은 가입 요청 함수를 실행할 수 없다`,
        );
        await assert.rejects(
          db.query("select public.access_confirm_admin($1,$2)", [
            ADMIN,
            ownerEmail,
          ]),
          /permission denied/i,
          `${role}은 관리자 지정 함수를 실행할 수 없다`,
        );
      } finally {
        await db.exec("reset role");
      }
    }

    // 서버 역할은 definer 함수로만 상태를 바꾼다. 표를 직접 고칠 수 있으면 함수의 검증이 무의미해진다.
    await db.exec("set role service_role");
    try {
      assert.equal(
        (await submit(db, MEMBER, "member@example.com")).user.status,
        "pending",
      );
      assert.equal(await decide(db, ADMIN, MEMBER, "approve", 0), "updated");
      await assert.rejects(
        db.query(
          "update public.access_users set status='approved' where user_id=$1",
          [MEMBER],
        ),
        /permission denied/i,
        "service_role도 접근 표를 직접 수정할 수 없다",
      );
      assert.equal((await row(db, MEMBER))?.status, "approved");
    } finally {
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

test("링크·화면의 동작 파라미터는 허용된 동작과 revision 형식만 통과시킨다", () => {
  assert.equal(parseAccessAction("approve"), "approve");
  assert.equal(parseAccessAction("reject"), "reject");
  assert.equal(parseAccessAction("revoke"), "revoke");
  assert.equal(parseAccessAction("delete"), null);
  assert.equal(parseAccessAction(undefined), null);
  // 중복 파라미터는 첫 값만 본다. 어느 값이 의도인지 추측해 실행하지 않는다.
  assert.equal(parseAccessAction(["approve", "reject"]), "approve");

  assert.equal(parseRevision("0"), 0);
  assert.equal(parseRevision("12"), 12);
  assert.equal(parseRevision("007"), null);
  assert.equal(parseRevision("-1"), null);
  assert.equal(parseRevision("1.5"), null);
  assert.equal(parseRevision(String(Number.MAX_SAFE_INTEGER + 1)), null);
  assert.equal(parseRevision(undefined), null);

  // 관리자 판정은 관리자 표시와 승인 상태가 모두 맞을 때만 참이다.
  assert.equal(isAdminRow({ status: "approved", isAdmin: true }), true);
  for (const notAdmin of [
    { status: "pending", isAdmin: true },
    { status: "rejected", isAdmin: true },
    { status: "revoked", isAdmin: true },
    { status: "approved", isAdmin: false },
  ] as const) {
    assert.equal(isAdminRow(notAdmin), false);
  }
});

test("복귀 경로는 승인 흐름의 화면만 허용하고 열린 리다이렉트를 만들지 않는다", () => {
  // 외부 URL·프로토콜 상대 경로·역슬래시·제어문자·과길이 값은 열린 리다이렉트나 헤더 주입이 되므로 버린다.
  for (const hostile of [
    "https://evil.example.com/admin",
    "//evil.example.com",
    "/\\evil.example.com",
    "/admin:8080",
    "/admin\r\nSet-Cookie: x",
    "/main%0d%0aSet-Cookie:x",
    "/%2F%2Fevil.example.com/admin",
    "/main\x00",
    "main",
    "",
    `/${"a".repeat(512)}`,
    undefined,
  ]) {
    assert.equal(
      safeInternalPath(hostile),
      null,
      `${String(hostile)}는 복귀 경로가 아니다`,
    );
  }

  // 허용 화면과 질의는 의도·revision만 남기고 정규화한다.
  assert.equal(safeInternalPath("/main"), "/main");
  assert.equal(safeInternalPath("/main/"), "/main");
  assert.equal(safeInternalPath("/admin"), "/admin");
  assert.equal(
    safeInternalPath("/main/gurus/nancy-pelosi"),
    "/main/gurus/nancy-pelosi",
  );
  assert.equal(
    safeInternalPath("/main/gurus/cathie-wood?fund=ARKK"),
    "/main/gurus/cathie-wood?fund=ARKK",
  );
  assert.equal(
    safeInternalPath(`/admin?request=${MEMBER}&revision=3&intent=reject`),
    `/admin?request=${MEMBER}&intent=reject&revision=3`,
  );
  // 로그인·대기 화면으로 되돌아가는 순환은 만들지 않는다.
  assert.equal(safeInternalPath("/login"), null);
  assert.equal(safeInternalPath("/pending"), null);
  assert.equal(safeInternalPath("/pending?next=/main"), null);
  assert.equal(safeInternalPath(["/pending", "/admin"]), null);
  // 목록 밖 경로·질의, 중복 파라미터, 형식이 어긋난 값은 의도를 추측하지 않고 버린다.
  for (const rejected of [
    "/main?x=1",
    "/main?fund=ARKK&extra=1",
    "/admin?x=1",
    `/admin/requests/${MEMBER}`,
    "/admin?request=not-a-uuid&intent=approve&revision=3",
    `/admin?request=${MEMBER}&INTENT=approve&revision=3`,
    `/admin?request=${MEMBER}&intent=revoke&revision=3`,
    `/admin?request=${MEMBER}&intent=approve&revision=007`,
    `/admin?request=${MEMBER}&intent=approve&revision=3&extra=1`,
    `/admin?request=${MEMBER}&intent=approve&revision=3&revision=4`,
    "/main/gurus/nancy-pelosi/extra",
    "/main/gurus/cathie-wood?fund=ARKK&fund=TSLA",
    "/Main",
    "/main/..%2f..%2fadmin",
  ]) {
    assert.equal(
      safeInternalPath(rejected),
      null,
      `${rejected}는 복귀 경로가 아니다`,
    );
  }
  // 정규화는 허용 목록을 넓히지 않는다. 조각은 버리고, `..`는 정규 경로로 접힌 뒤 다시 판정한다.
  assert.equal(safeInternalPath("/main#/admin"), "/main");
  assert.equal(safeInternalPath("/main/../admin"), "/admin");
});

test("경로별 접근 판정은 상태·관리자 여부와 공개 인증 경로로만 갈린다", () => {
  const facts = (overrides: Partial<RouteFacts> = {}): RouteFacts => ({
    signedIn: false,
    verified: false,
    resolved: false,
    status: null,
    admin: false,
    ...overrides,
  });

  const anonymous = facts();
  const unresolved = facts({ signedIn: true, verified: true, resolved: false });
  const pending = facts({
    signedIn: true,
    verified: true,
    resolved: true,
    status: "pending",
  });
  const member = facts({
    signedIn: true,
    verified: true,
    resolved: true,
    status: "approved",
  });
  const admin = facts({ ...member, admin: true });

  // 공개 문서와 OAuth 실행 경로는 로그인·승인 상태와 무관하게 접근할 수 있다.
  for (const path of [
    "/",
    "/privacy",
    "/terms",
    "/auth",
    "/auth/callback",
    "/auth/signin",
    "/auth/signout",
  ]) {
    for (const fact of [anonymous, unresolved, pending, member, admin]) {
      assert.equal(routeFor(path, fact), "self", `${path}는 공개 경로다`);
    }
  }
  // 인증 표면과 이름이 비슷한 보호 경로는 공개로 새지 않는다.
  assert.equal(routeFor("/authenticated", anonymous), "not-found");
  assert.equal(routeFor("/authorize", pending), "pending");
  assert.equal(routeFor("/privacy/export", anonymous), "not-found");
  assert.equal(routeFor("/terms-private", pending), "pending");

  // 익명과 신원 미확인 세션은 보호 화면을 열 수 없다.
  for (const path of [
    "/main",
    "/main/gurus/nancy-pelosi",
    "/admin",
    "/pending",
  ]) {
    assert.equal(routeFor(path, anonymous), "not-found");
    assert.equal(
      routeFor(path, facts({ signedIn: true, verified: false })),
      "not-found",
    );
  }
  assert.equal(routeFor("/login", anonymous), "self");
  assert.equal(routeFor("/login", pending), "pending");

  // 승인 표 확인 실패 시 조회 화면은 대기로 보내되 관리자 화면은 404로 차단한다.
  for (const path of ["/main", "/pending"]) {
    assert.equal(routeFor(path, unresolved), "pending");
  }
  assert.equal(routeFor("/login", unresolved), "self");
  assert.equal(routeFor("/admin", unresolved), "not-found");

  // 승인되지 않은 상태는 /pending에 머물고 다른 화면은 열리지 않는다.
  for (const status of ["pending", "rejected", "revoked"] as const) {
    const blocked = facts({
      signedIn: true,
      verified: true,
      resolved: true,
      status,
    });
    assert.equal(routeFor("/pending", blocked), "self");
    assert.equal(routeFor("/main", blocked), "pending");
    assert.equal(routeFor("/admin", blocked), "not-found");
  }

  // 승인된 일반 사용자는 보호 화면을 열되 /admin 계열은 열리지 않고 /login·/pending에서는 홈으로 간다.
  assert.equal(routeFor("/", member), "self");
  assert.equal(routeFor("/main/gurus/nancy-pelosi", member), "self");
  assert.equal(routeFor("/login", member), "home");
  assert.equal(routeFor("/pending", member), "home");
  assert.equal(routeFor("/admin", member), "not-found");
  assert.equal(routeFor("/admin/requests", member), "not-found");
  // 이름이 비슷한 경로는 관리자·보호 화면으로 새지 않는다.
  assert.equal(routeFor("/administrator", member), "self");
  assert.equal(routeFor("/administrator", pending), "pending");

  assert.equal(routeFor("/admin", admin), "self");
  assert.equal(routeFor("/admin/requests", admin), "self");
  assert.equal(routeFor("/main", admin), "self");
});

test("세션의 Google 신원 확인은 확인된 provider 이메일만 신뢰한다", () => {
  const identity = {
    id: MEMBER,
    email: "member@example.com",
    emailConfirmedAt: "2026-09-18T00:00:00Z",
    provider: "google",
    identities: [
      {
        provider: "google",
        identityData: { email: "member@example.com", email_verified: true },
      },
    ],
  };
  assert.deepEqual(verifiedGoogleIdentity(identity), {
    userId: MEMBER,
    email: "member@example.com",
  });

  const rejected = [
    { ...identity, provider: "github" },
    { ...identity, emailConfirmedAt: null },
    { ...identity, identities: null },
    {
      ...identity,
      identities: [
        {
          provider: "google",
          identityData: { email: "member@example.com", email_verified: false },
        },
      ],
    },
    {
      ...identity,
      identities: [
        {
          provider: "google",
          identityData: { email: "other@example.com", email_verified: true },
        },
      ],
    },
  ];
  for (const [index, input] of rejected.entries()) {
    assert.equal(
      verifiedGoogleIdentity(input),
      null,
      `신원 거부 사례 ${index + 1}`,
    );
  }
});
