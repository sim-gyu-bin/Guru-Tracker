/**
 * 승인 기반 접근 제어의 순수 규칙 모음이다.
 *
 * 상태·결정 코드·메일 링크 의도처럼 화면과 서버가 함께 판단해야 하는 값만 여기에 둔다.
 * DB 접근이나 세션 처리는 `src/server/access.ts`가 맡고, 이 모듈은 부작용이 없다.
 */

export const ACCESS_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "revoked",
] as const;

/** 가입 요청의 수명 주기. pending만 관리자 결정을 기다린다. */
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

/** 상태 문구는 화면에서 그대로 쓴다. 미승인 상태를 승인처럼 보이게 하는 표현을 만들지 않는다. */
export const ACCESS_STATUS_LABELS: Record<AccessStatus, string> = {
  pending: "승인 대기",
  approved: "이용 가능",
  rejected: "가입 거절",
  revoked: "접근 해제",
};

/**
 * 관리자 화면에서 실행하는 동작이다.
 * `revoke`는 승인된 접근을 끊고, 재승인은 `approve`로 같은 전이를 다시 실행한다.
 */
export const ACCESS_ACTIONS = ["approve", "reject", "revoke"] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

export const ACCESS_ACTION_LABELS: Record<AccessAction, string> = {
  approve: "승인",
  reject: "거절",
  revoke: "접근 해제",
};

/** approve가 실제로 실행할 목표 상태. revoke는 승인된 접근을 해제한다. */
export const ACCESS_ACTION_TARGETS: Record<AccessAction, AccessStatus> = {
  approve: "approved",
  reject: "rejected",
  revoke: "revoked",
};

/**
 * DB 결정 함수가 돌려주는 코드다. 서버는 이 목록에 없는 응답을 실패로 취급한다.
 * `stale`은 기대 revision이 달라 아무것도 바꾸지 않았다는 뜻이며 실패가 아니라 무시다.
 */
export const ACCESS_DECISIONS = [
  "updated",
  "unchanged",
  "stale",
  "forbidden",
  "self",
  "invalid",
  "missing",
  "admin",
  "admin_exists",
  "unverified",
  "unconfigured",
] as const;
export type AccessDecision = (typeof ACCESS_DECISIONS)[number];

/** 결정 코드가 아니면 null. 알 수 없는 값을 성공으로 해석하지 않기 위한 경계다. */
export function parseAccessDecision(value: unknown): AccessDecision | null {
  if (typeof value !== "string") return null;
  return (ACCESS_DECISIONS as readonly string[]).includes(value)
    ? (value as AccessDecision)
    : null;
}

/** 관리자 목록에 보여 줄 결정 결과 문구. 실패 문구에는 상태가 바뀌지 않았다는 사실을 담는다. */
export const ACCESS_DECISION_MESSAGES: Record<AccessDecision, string> = {
  updated: "결정을 반영했습니다.",
  unchanged: "이미 같은 상태입니다.",
  stale: "다른 결정이 먼저 반영되어 이 요청은 처리하지 않았습니다.",
  forbidden: "이 결정을 실행할 권한이 없습니다.",
  self: "자신의 관리자 권한은 해제할 수 없습니다.",
  invalid: "지금 상태에서는 실행할 수 없는 동작입니다.",
  missing: "대상 가입 요청을 찾지 못했습니다.",
  admin: "이미 관리자입니다.",
  admin_exists: "이미 다른 관리자가 있어 승격하지 않았습니다.",
  unverified: "확인된 Google 계정이 아니라 승격하지 않았습니다.",
  unconfigured: "관리자 주소 설정이 없어 승격하지 않았습니다.",
};

/**
 * 링크 질의와 확인 패널이 담는 동작이다. 관리자 화면에서 실행하는 동작 목록과 같은 값만 허용하고
 * 그 밖의 값은 무시한다. 링크 파라미터는 확인 패널을 미리 고르는 용도이며 결정은 관리자가 실행한다.
 */
export function parseAccessAction(
  value: string | string[] | undefined,
): AccessAction | null {
  const single = Array.isArray(value) ? value[0] : value;
  return ACCESS_ACTIONS.find((action) => action === single) ?? null;
}

/** uuid 형식 확인. 메일 링크와 관리자 화면 입력 모두 이 검사를 통과해야 한다. */
export function isUserId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/** 내부 경로 해석 전용 기준 오리진. 실제 요청 주소가 아니며 리디렉션 대상이 되지 않는다. */
const INTERNAL_ORIGIN = "https://internal.invalid";

/** 화면이 존재하는 대상 상세는 `/main/gurus/<대상>` 한 단계뿐이다. */
function isGuruPath(path: string): boolean {
  const segment = path.split("/");
  return (
    segment.length === 4 &&
    segment[1] === "main" &&
    segment[2] === "gurus" &&
    /^[a-z0-9-]{1,64}$/.test(segment[3] ?? "")
  );
}

/** 같은 이름이 두 번 오면 어느 값이 의도인지 알 수 없으므로 복귀 경로 전체를 버린다. */
function uniqueNames(names: string[]): boolean {
  return names.every((name, index) => names.indexOf(name) === index);
}

/** 대상 화면의 펀드 선택만 질의로 남긴다. 그 밖의 파라미터는 복귀 경로를 만들지 않는다. */
function fundQuery(params: URLSearchParams): string | null {
  const names = Array.from(params.keys());
  if (names.length === 0) return "";
  if (names.length !== 1 || names[0] !== "fund") return null;
  const fund = params.get("fund");
  return fund !== null && /^[A-Z0-9.-]{1,12}$/.test(fund)
    ? `?fund=${fund}`
    : null;
}

/**
 * 복귀 경로가 실을 수 있는 의도. 메일이 안내하는 승인·거절 두 가지뿐이다.
 * 접근 해제(`revoke`)는 관리자가 화면에서 직접 여는 확인 패널 전용이므로, 남의 URL이 로그인을 거쳐
 * 파괴적 확인 패널을 미리 골라 두는 통로가 되지 않게 복귀 경로에서는 받지 않는다.
 */
const RETURN_INTENTS = ["approve", "reject"] as const;
type ReturnIntent = (typeof RETURN_INTENTS)[number];

function returnIntent(value: string | null): ReturnIntent | null {
  return value === "approve" || value === "reject" ? value : null;
}

/**
 * 관리자 화면의 확인 패널 링크(`?request=&intent=&revision=`)만 질의로 남긴다.
 * 메일이 안내하는 세 값을 그대로 받아, 관리자가 화면에서 한 번 더 확인한 뒤에만 결정이 실행되게 한다.
 */
function requestQuery(params: URLSearchParams): string | null {
  const names = Array.from(params.keys());
  if (names.length === 0) return "";
  if (names.length !== 3 || !uniqueNames(names)) return null;
  const userId = params.get("request") ?? "";
  const intent = returnIntent(params.get("intent"));
  const revision = parseRevision(params.get("revision") ?? undefined);
  if (!isUserId(userId) || intent === null || revision === null) return null;
  return `?request=${userId}&intent=${intent}&revision=${revision}`;
}

/**
 * 복귀를 허용하는 경로 모양과 질의 규칙. 처음 맞는 규칙 하나만 적용하고 나머지는 버리므로
 * `/admin` 같은 접두 경로가 다른 규칙으로 새지 않는다.
 */
const RETURN_RULES: readonly {
  matches: (path: string) => boolean;
  query: (params: URLSearchParams) => string | null;
}[] = [
  { matches: (path) => path === "/main" || isGuruPath(path), query: fundQuery },
  { matches: (path) => path === "/admin", query: requestQuery },
];

/**
 * 로그인 후 되돌아갈 내부 경로만 통과시킨다.
 *
 * 메일 링크·로그인 폼·콜백이 모두 이 함수를 거치므로 open redirect와 프로토콜 상대 URL,
 * 백슬래시 우회(`/\evil.example`)를 한 곳에서 막는다. 더불어 복귀 대상을 `/main`,
 * `/main/gurus/<대상>`, `/admin?request=&intent=&revision=`로 제한해
 * 로그인·콜백·대기 화면으로 되돌아가는 순환과 승인 흐름에 필요 없는 경로를 모두 버린다.
 * 형식이 어긋나면 null이며, 반환값은 정규화된 형태라 호출자가 그대로 리디렉션에 쓴다.
 */
export function safeInternalPath(
  value: string | string[] | null | undefined,
): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  if (
    typeof single !== "string" ||
    single.length === 0 ||
    single.length > 512
  ) {
    return null;
  }
  if (!single.startsWith("/") || single.startsWith("//")) return null;
  // 역슬래시와 제어문자(\r\n\t\0 포함)는 경로 정규화 과정에서 브라우저별로 다르게 해석되므로 통과시키지 않는다.
  if (/[\\\u0000-\u001f\u007f]/.test(single)) return null;
  let url: URL;
  try {
    // 기준 오리진으로 해석해 절대 URL과 스킴 상대 URL을 내부 경로로 착각하지 않는다.
    url = new URL(single, INTERNAL_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== INTERNAL_ORIGIN) return null;
  // 마지막 슬래시는 표기 차이일 뿐이므로 한 가지 형태로 정규화한다.
  const path = url.pathname.replace(/\/+$/, "") || "/";
  for (const rule of RETURN_RULES) {
    if (!rule.matches(path)) continue;
    const query = rule.query(url.searchParams);
    return query === null ? null : `${path}${query}`;
  }
  return null;
}

/** revision 파라미터는 10진 정수만 허용한다. 값이 어긋나면 링크 의도를 실행하지 않는다. */
export function parseRevision(
  value: string | string[] | undefined,
): number | null {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(single))
    return null;
  const parsed = Number(single);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** 승인 대기 행은 오래된 메일이든 현재 화면이든 같은 revision 규칙으로만 결정한다. */
export type AccessRow = {
  userId: string;
  email: string;
  status: AccessStatus;
  isAdmin: boolean;
  revision: number;
  requestedAt: string;
  decidedAt: string | null;
};

/**
 * 관리자 화면 접근 조건. 관리자 표시만으로는 부족하고 승인 상태여야 한다.
 * 프록시·관리자 화면·관리자 API가 함께 쓰는 단일 판정이다.
 */
export function isAdminRow(
  row: Pick<AccessRow, "status" | "isAdmin">,
): boolean {
  return row.isAdmin && row.status === "approved";
}

/**
 * DB 행을 화면·판정에 쓰는 형태로 좁힌다.
 * 알 수 없는 상태나 빠진 필드는 null로 만들며, 해석할 수 없는 행을 승인으로 넘기지 않는다.
 */
export function toAccessRow(value: unknown): AccessRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const status = row.status;
  if (
    typeof row.user_id !== "string" ||
    typeof row.email !== "string" ||
    typeof status !== "string" ||
    !(ACCESS_STATUSES as readonly string[]).includes(status) ||
    typeof row.is_admin !== "boolean" ||
    typeof row.revision !== "number" ||
    !Number.isSafeInteger(row.revision) ||
    typeof row.requested_at !== "string"
  ) {
    return null;
  }
  return {
    userId: row.user_id,
    email: row.email,
    status: status as AccessStatus,
    isAdmin: row.is_admin,
    revision: row.revision,
    requestedAt: row.requested_at,
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
  };
}

/** 미승인 상태별 안내 문구. revoked는 다시 요청할 수 없다는 사실을 분명히 적는다. */
export const ACCESS_STATUS_NOTICES: Record<
  Exclude<AccessStatus, "approved">,
  { title: string; body: string }
> = {
  pending: {
    title: "가입 요청을 접수했습니다",
    body: "관리자 확인이 끝나면 이용할 수 있습니다. 승인 전에는 공시 화면을 열 수 없습니다.",
  },
  rejected: {
    title: "가입 요청이 거절되었습니다",
    body: "이 계정으로는 이용할 수 없습니다. 필요하면 관리자에게 문의해 주세요.",
  },
  revoked: {
    title: "접근이 해제되었습니다",
    body: "다시 로그인해도 같은 계정은 자동으로 승인되지 않습니다. 재승인은 관리자만 할 수 있습니다.",
  },
};

/**
 * 승인 상태를 읽지 못한 이유별 문구. 승인으로 해석하지 않는다는 사실과 다음 행동만 적는다.
 * `absent`는 같은 이메일의 다른 계정이 DB 고유 색인에 막힌 경우를 포함하며, 계정을 합치지 않는다.
 */
export const ACCESS_UNRESOLVED_NOTICES: Record<
  "absent" | "unconfigured" | "error",
  { title: string; body: string }
> = {
  absent: {
    title: "가입 요청을 접수하지 못했습니다",
    body: "같은 이메일로 이미 다른 계정의 요청이 있거나, 저장 단계에서 요청이 만들어지지 않았습니다. 계정은 자동으로 합치지 않습니다. 관리자에게 문의해 주세요.",
  },
  unconfigured: {
    title: "가입 승인 설정이 필요합니다",
    body: "서버에 가입 승인 기능이 적용되지 않았습니다. 관리자에게 문의해 주세요.",
  },
  error: {
    title: "승인 상태를 확인하지 못했습니다",
    body: "잠시 뒤 다시 시도해 주세요. 승인이 확인되기 전에는 공시 화면을 열 수 없습니다.",
  },
};

/** 로그인 라우트가 되돌려 주는 OAuth 실패 코드. 이 목록 밖의 값은 화면에서 무시한다. */
export const OAUTH_ERROR_CODES = [
  "unconfigured",
  "start",
  "missing_code",
  "oauth_denied",
  "exchange",
  "unverified",
] as const;
export type OauthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

/** 알 수 없는 코드는 null이다. 실패를 성공처럼 보이게 하는 문구를 만들지 않기 위한 경계다. */
export function parseOauthError(
  value: string | string[] | undefined,
): OauthErrorCode | null {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === "string" &&
    (OAUTH_ERROR_CODES as readonly string[]).includes(single)
    ? (single as OauthErrorCode)
    : null;
}

/** 로그인 화면 문구. 원인을 세분화해 노출하지 않고 사용자가 할 다음 행동만 안내한다. */
export const OAUTH_ERROR_NOTICES: Record<OauthErrorCode, string> = {
  unconfigured:
    "서버에 Google 로그인 설정이 없습니다. 관리자에게 문의해 주세요.",
  start: "Google 로그인을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  missing_code:
    "로그인 응답이 올바르지 않습니다. Google 로그인을 다시 시도해 주세요.",
  oauth_denied: "Google 로그인이 취소되었습니다. 다시 시도해 주세요.",
  exchange: "로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  unverified:
    "확인된 Google 계정이 아닙니다. Google 계정으로 다시 로그인해 주세요.",
};

/** 로그아웃 라우트가 되돌려 주는 결과 코드. 이 목록 밖의 값은 화면에서 무시한다. */
export const LOGOUT_RESULT_CODES = ["unconfirmed"] as const;
export type LogoutResultCode = (typeof LOGOUT_RESULT_CODES)[number];

/** 알 수 없는 코드는 null이다. 로그아웃하지 못한 상태를 성공처럼 보이게 하지 않기 위한 경계다. */
export function parseLogoutResult(
  value: string | string[] | undefined,
): LogoutResultCode | null {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === "string" &&
    (LOGOUT_RESULT_CODES as readonly string[]).includes(single)
    ? (single as LogoutResultCode)
    : null;
}

/**
 * 로그아웃 결과 문구. 브라우저에서 지운 것과 서버에서 확인한 것을 구분해 적는다.
 * 서버 확인에 실패한 세션은 만료 전까지 남을 수 있으므로 그 사실을 숨기지 않는다.
 */
export const LOGOUT_RESULT_NOTICES: Record<
  LogoutResultCode,
  { title: string; body: string }
> = {
  unconfirmed: {
    title: "로그아웃했습니다",
    body: "브라우저에 저장된 로그인 정보는 삭제했습니다. 다만 서버 세션 폐기는 확인하지 못해 그 세션은 만료 시각까지 남을 수 있습니다.",
  },
};

/**
 * 화면 접근에 필요한 세션·승인 요약.
 *
 * Proxy는 요청 쿠키와 PostgREST로, 서버 컴포넌트는 `next/headers`로 같은 사실을 채운 뒤
 * 같은 판정 함수를 쓴다. 판정 규칙이 두 곳으로 갈라지지 않게 하는 경계다.
 */
export type RouteFacts = {
  /** 요청에 확인된 세션이 있는가 */
  signedIn: boolean;
  /** provider가 확인한 Google 신원인가 */
  verified: boolean;
  /** 승인 표를 읽었는가 */
  resolved: boolean;
  /** 확인된 승인 상태. 확인 전이면 null */
  status: AccessStatus | null;
  /** 승인된 관리자인가 */
  admin: boolean;
};

/** 되돌아갈 목적지. self는 요청한 화면을 그대로 연다. */
export type RouteTarget = "self" | "not-found" | "pending" | "home";

/**
 * OAuth 실행 경로인가.
 *
 * 로그인 시작·코드 교환·로그아웃은 세션과 승인 여부를 판정하기 전에 실행되어야 한다.
 * 미로그인 상태의 코드 교환을 로그인 화면으로 되돌리면 승인 흐름이 시작조차 되지 않으므로,
 * 이 경로들은 접근 판정 대신 각 라우트의 자체 검증(PKCE 교환, Origin 확인)에 맡긴다.
 */
export function isAuthExecutionPath(pathname: string): boolean {
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

/**
 * 홈페이지·정책은 누구나 열고, /login은 로그인 상태에 따라 목적지를 결정한다.
 * /pending은 로그인, /admin은 관리자, 나머지는 승인이 필요하다. /auth는 자체 검증에 맡긴다.
 */
export function surfaceOf(
  pathname: string,
): "public" | "login" | "pending" | "admin" | "protected" {
  if (isAuthExecutionPath(pathname)) return "public";
  // 명시한 문서만 공개한다. 비슷한 이름이나 하위 경로까지 보호 범위를 넓혀 해제하지 않는다.
  if (pathname === "/" || pathname === "/privacy" || pathname === "/terms") {
    return "public";
  }
  if (pathname === "/login" || pathname.startsWith("/login/")) return "login";
  if (pathname === "/pending" || pathname.startsWith("/pending/")) {
    return "pending";
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  return "protected";
}

/**
 * 요청 경로와 접근 사실로 목적지를 정한다.
 *
 * 승인 표를 확인하지 못한 경우(unresolved)는 승인으로 해석하지 않고 안내 화면으로 보낸다.
 * 미승인 상태는 상태를 알 수 있는 /pending에 머무르게 하고, 그 밖의 화면은 열지 않는다.
 * OAuth 실행 경로는 사실과 무관하게 그대로 연다. 재로그인 콜백이 승인 상태 때문에 막히면 안 된다.
 */
export function routeFor(pathname: string, facts: RouteFacts): RouteTarget {
  const surface = surfaceOf(pathname);
  if (surface === "public") return "self";
  if (!facts.signedIn || !facts.verified) {
    return surface === "login" ? "self" : "not-found";
  }
  // 관리자 신원·승인을 확인할 수 없는 요청에는 관리자 화면의 존재를 노출하지 않는다.
  if (
    surface === "admin" &&
    (!facts.resolved || !facts.admin || facts.status !== "approved")
  ) {
    return "not-found";
  }
  if (!facts.resolved) {
    return surface === "login" ? "self" : "pending";
  }
  if (facts.status === "approved") {
    if (surface === "login" || surface === "pending") return "home";
    return "self";
  }
  return surface === "pending" ? "self" : "pending";
}

/** 메일 본문에 사용자 이메일을 넣을 때 마크업이 열리지 않게 한다. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 세션 사용자에서 확인된 Google 신원만 뽑는다.
 *
 * `user_metadata` 같은 사용자가 바꿀 수 있는 값은 보지 않고, Auth가 반환한 provider와
 * identity의 확인된 이메일만 쓴다. Google provider가 아니거나 이메일이 확인되지 않았으면 null이다.
 */
export type GoogleIdentityInput = {
  id: string;
  email?: string | null;
  emailConfirmedAt?: string | null;
  /** app_metadata.provider */
  provider?: string | null;
  identities?: ReadonlyArray<{
    provider?: string | null;
    identityData?: Record<string, unknown> | null;
  }> | null;
};

export type VerifiedIdentity = { userId: string; email: string };

export function verifiedGoogleIdentity(
  user: GoogleIdentityInput,
): VerifiedIdentity | null {
  if (user.provider !== "google") return null;
  const accountEmail = user.email?.trim().toLowerCase();
  if (!accountEmail || !user.emailConfirmedAt) return null;
  const identity = user.identities?.find(
    (candidate) => candidate.provider === "google",
  );
  const identityData = identity?.identityData;
  if (!identityData) return null;
  if (identityData.email_verified !== true) return null;
  const identityEmail =
    typeof identityData.email === "string"
      ? identityData.email.trim().toLowerCase()
      : "";
  // 계정 이메일과 provider가 확인한 이메일이 다르면 어느 쪽을 신원으로 볼지 정할 수 없으므로 거부한다.
  if (identityEmail !== accountEmail) return null;
  return { userId: user.id, email: accountEmail };
}
