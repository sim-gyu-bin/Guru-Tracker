import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AdminDecisionBoundary,
  AdminDecisionForm,
} from "@/components/admin-decision-forms";
import { AdminSyncHealth } from "@/components/admin-sync-health";
import { AdminTabs } from "@/components/admin-tabs";
import { AppShell } from "@/components/app-shell";
import { GuruLink } from "@/components/guru-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ACCESS_ACTION_LABELS,
  ACCESS_DECISION_MESSAGES,
  ACCESS_STATUS_LABELS,
  type AccessAction,
  type AccessRow,
  type AccessStatus,
  isUserId,
  parseAccessAction,
  parseAccessDecision,
  parseRevision,
} from "@/domain/access";
import { requireAdminPage } from "@/server/access";
import { decideAccess, listAccessRows } from "@/server/access-store";
import { isSameOriginRequest } from "@/server/origin";
import { getSyncHealthView } from "@/server/sync-health";

// 관리자 결정은 매 요청마다 DB에서 다시 읽는다. 같은 화면을 두 번 열어도 최신 상태를 본다.
export const dynamic = "force-dynamic";

type AdminPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

/**
 * server action이 출처를 확인하지 못해 스스로 되돌린 경우의 화면 코드다.
 * DB 결정 함수가 돌려주는 코드와 섞이지 않게 이 화면에서만 쓴다.
 */
const ORIGIN_BLOCKED = "origin";

/** 상태 배지. 승인만 채운 색을 쓰고 대기는 테두리, 거절·해제는 경고색으로 구분한다. */
function statusBadge(
  status: AccessStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "approved") return "secondary";
  if (status === "pending") return "outline";
  return "destructive";
}

/**
 * 확인 패널을 열지 못했을 때 보여 줄 이유. 패널을 열 수 있으면 호출하지 않는다.
 * 오래된 링크·이미 지나간 상태·불완전한 링크를 구분해 관리자가 현재 상태를 다시 보게 한다.
 */
function panelNotice(
  focus: AccessRow | null,
  intent: AccessAction | null,
  revision: number | null,
): string {
  if (focus === null) {
    return "안내받은 요청을 현재 목록에서 찾지 못했습니다. 아래 목록에서 직접 확인해 주세요.";
  }
  if (intent === null || revision === null) {
    return "안내받은 화면 정보가 불완전합니다. 아래 목록에서 현재 상태를 확인해 주세요.";
  }
  if (revision !== focus.revision) {
    return "안내받은 뒤 상태가 바뀌었습니다. 아래 목록의 현재 상태를 확인하고 다시 결정해 주세요.";
  }
  return "지금 상태에서는 실행할 수 없는 동작입니다. 아래 목록에서 현재 상태를 확인해 주세요.";
}

/** 상태별로 실행할 수 있는 결정. 거절·해제된 요청은 재승인만 가능하다. */
function decisionsFor(status: AccessStatus): readonly AccessAction[] {
  if (status === "pending") return ["approve", "reject"];
  if (status === "approved") return ["revoke"];
  return ["approve"];
}

/** 요청·결정 시각 표기. 서버 시간대와 무관하게 한국 시간으로만 보여 준다. */
function moment(value: string | null): string {
  if (!value) return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "확인 불가";
  return at.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

/**
 * 관리자 결정 server action.
 *
 * 출처 확인 → 관리자 검증 → 입력 검증 → DB 함수 호출 순서로만 상태를 바꾼다. Next의 server action
 * 기본 방어는 `origin` 헤더가 없으면 경고만 남기고 통과시키므로(`action-handler.js`) 여기서 한 번 더
 * 막는다. 화면이 보낸 기대 revision을 함께 넘겨 오래된 화면이나 메일의 결정이 최신 결정을
 * 덮어쓰지 못하게 한다. 이메일 주소는 받지 않는다(식별자는 DB가 준 user id뿐이다).
 * 결과는 화면 문구 코드로만 되돌린다.
 */
async function decide(formData: FormData): Promise<void> {
  "use server";

  // 다른 출처에서 왔거나 출처를 확인할 수 없는 POST는 관리자 검증과 DB 함수 앞에서 끝낸다.
  // 세션 쿠키가 실려 있어도 실행하지 않는다.
  if (!isSameOriginRequest(await headers())) {
    redirect("/admin?result=origin");
  }
  // 관리자 검증을 먼저 한다. 승인되지 않은 호출은 DB 함수까지 도달하지 않는다.
  const admin = await requireAdminPage();
  const userId = formData.get("userId");
  const action = parseAccessAction(formData.get("action")?.toString());
  const revision = parseRevision(formData.get("expectedRevision")?.toString());
  if (
    typeof userId !== "string" ||
    !isUserId(userId) ||
    action === null ||
    revision === null
  ) {
    redirect("/admin?result=invalid");
  }
  const decision = await decideAccess(admin.userId, {
    userId,
    action,
    expectedRevision: revision,
  });
  redirect(`/admin?result=${decision ?? "unknown"}`);
}

/**
 * 행 동작은 기대 revision을 담아 즉시 제출하고 공통 제출 경계에서 연속 이벤트를 차단한다.
 * 자신의 계정은 해제 버튼을 미리 비활성화한다(DB도 같은 규칙으로 막는다).
 */
function RowActions({
  actions,
  adminId,
  row,
}: Readonly<{
  actions: readonly AccessAction[];
  adminId: string;
  row: AccessRow;
}>) {
  return (
    <div className="flex flex-wrap justify-start gap-1.5 min-[761px]:justify-end">
      {actions.map((action) =>
        action === "revoke" && row.userId === adminId ? (
          <Button disabled key={action} size="sm" variant="outline">
            접근 해제
          </Button>
        ) : (
          <AdminDecisionForm action={decide} key={action}>
            <input name="userId" type="hidden" value={row.userId} />
            <input name="action" type="hidden" value={action} />
            <input
              name="expectedRevision"
              type="hidden"
              value={String(row.revision)}
            />
            <Button
              size="sm"
              type="submit"
              variant={action === "revoke" ? "outline" : "secondary"}
            >
              {ACCESS_ACTION_LABELS[action]}
            </Button>
          </AdminDecisionForm>
        ),
      )}
    </div>
  );
}

/**
 * 가입 승인과 공시 동기화 상태를 URL 기반 탭으로 나누는 운영 관리 화면.
 *
 * 대기 요청 검토·승인·거절·접근 해제·재승인을 한 화면에서 처리한다. 메일 링크는 여기로 오는
 * 안내일 뿐이며, 실제 변경은 관리자가 이 화면에서 누른 버튼(POST)으로만 일어난다.
 * 목록에는 요청 계정 이메일이 필요하므로 서버에서만 읽고 로그에 남기지 않는다.
 */
export default async function AdminPage({ searchParams }: AdminPageProps) {
  const admin = await requireAdminPage();
  // 관리자 검증 뒤에만 읽는다. 상태판 조회가 실패해도 가입 승인 화면을 막지 않는다.
  const syncHealthPromise = getSyncHealthView();
  const params = await searchParams;

  // 승인 안내 쿼리가 있으면 동기화 탭 URL이어도 안내가 가려지지 않게 가입 승인을 우선한다.
  // `tab=sync` 한 값만 유효하며, 배열·알 수 없는 값은 URL을 보존한 채 가입 승인으로 표시한다.
  const hasApprovalQuery = ["request", "intent", "revision", "result"].some(
    (key) => params[key] !== undefined,
  );
  const activeTab =
    !hasApprovalQuery && params.tab === "sync" ? "sync" : "approvals";

  const requested =
    typeof params.request === "string" && isUserId(params.request)
      ? params.request
      : null;
  const intent = parseAccessAction(params.intent);
  const mailRevision = parseRevision(params.revision);
  const result = typeof params.result === "string" ? params.result : null;
  const decision = parseAccessDecision(params.result);

  const rows = await listAccessRows();
  // 대기 요청을 먼저 보여 준다. 같은 상태 안에서는 DB가 준 요청 시각 역순을 유지한다.
  const ordered = rows
    ? [...rows].sort(
        (a, b) =>
          Number(b.status === "pending") - Number(a.status === "pending"),
      )
    : null;
  const focus =
    requested && ordered
      ? (ordered.find((row) => row.userId === requested) ?? null)
      : null;
  const pendingCount =
    ordered?.filter((row) => row.status === "pending").length ?? 0;
  const syncHealth = await syncHealthPromise;

  // 확인 패널은 안내받은 revision이 현재 행과 같고 그 동작을 지금 실행할 수 있을 때만 연다.
  // 오래된 메일·이미 처리된 요청·자기 자신의 해제는 패널 대신 현재 상태를 알린다.
  const confirm =
    focus !== null &&
    intent !== null &&
    mailRevision !== null &&
    mailRevision === focus.revision &&
    decisionsFor(focus.status).includes(intent) &&
    !(intent === "revoke" && focus.userId === admin.userId)
      ? { action: intent, row: focus }
      : null;

  const outcome =
    decision !== null
      ? {
          failed: decision !== "updated",
          text: ACCESS_DECISION_MESSAGES[decision],
        }
      : result === ORIGIN_BLOCKED
        ? {
            failed: true,
            text: "다른 출처에서 온 요청이라 결정을 반영하지 않았습니다. 관리자 화면에서 다시 시도해 주세요.",
          }
        : result !== null
          ? {
              failed: true,
              text: "결정을 실행하지 못했습니다. 아래 목록에서 현재 상태를 다시 확인해 주세요.",
            }
          : null;

  return (
    <AppShell admin current="admin">
      <h1 className="text-xl font-semibold tracking-[-0.01em]">운영 관리</h1>
      <p className="mt-2 max-w-[720px] text-[13px] leading-[20px] text-muted-foreground">
        가입 요청과 공시 수집 상태를 함께 관리합니다.
      </p>

      <AdminTabs
        activeTab={activeTab}
        approvals={
          <>
            <section aria-labelledby="approval-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold" id="approval-heading">
                  가입 승인
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  승인 {pendingCount}건 · 전체 {ordered?.length ?? 0}건
                </p>
              </div>
              <p className="mt-2 max-w-[720px] text-[13px] leading-[20px] text-muted-foreground">
                Google 로그인으로 접수된 요청을 검토합니다. 승인된 계정만 공시
                화면과 동기화 API를 쓸 수 있고, 접근 해제는 다음 요청부터
                적용됩니다.
              </p>

              {outcome ? (
                <Alert
                  className="mt-5"
                  variant={outcome.failed ? "destructive" : "default"}
                >
                  <AlertTitle>
                    {outcome.failed
                      ? "결정을 반영하지 못했습니다"
                      : "결정을 반영했습니다"}
                  </AlertTitle>
                  <AlertDescription className="text-[13px] leading-[19px]">
                    {outcome.text}
                  </AlertDescription>
                </Alert>
              ) : null}

              <AdminDecisionBoundary>
                {confirm ? (
                  <div
                    aria-label="결정 확인"
                    className="mt-3 rounded-lg border border-border bg-card p-4"
                    role="group"
                  >
                    <p className="text-[13px] font-medium">
                      {`${confirm.row.email} · ${ACCESS_ACTION_LABELS[confirm.action]} 확정`}
                    </p>
                    <p className="mt-1 text-[13px] leading-[19px] text-muted-foreground">
                      {`현재 상태는 ${ACCESS_STATUS_LABELS[confirm.row.status]}입니다. ${
                        confirm.action === "approve"
                          ? "확정하면 이 계정이 공시 화면과 동기화 API를 쓸 수 있습니다."
                          : confirm.action === "reject"
                            ? "확정하면 이 계정은 승인되지 않은 상태로 남습니다."
                            : "확정하면 다음 요청부터 이 계정의 접근이 끊깁니다."
                      }`}
                    </p>
                    <AdminDecisionForm
                      action={decide}
                      className="mt-3 flex flex-wrap gap-2"
                    >
                      <input
                        name="userId"
                        type="hidden"
                        value={confirm.row.userId}
                      />
                      <input
                        name="action"
                        type="hidden"
                        value={confirm.action}
                      />
                      <input
                        name="expectedRevision"
                        type="hidden"
                        value={String(confirm.row.revision)}
                      />
                      <Button size="sm" type="submit">
                        {`${ACCESS_ACTION_LABELS[confirm.action]} 확정`}
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <GuruLink href="/admin">취소</GuruLink>
                      </Button>
                    </AdminDecisionForm>
                  </div>
                ) : requested !== null ? (
                  <Alert className="mt-3">
                    <AlertTitle>결정을 진행할 수 없습니다</AlertTitle>
                    <AlertDescription className="text-[13px] leading-[19px]">
                      {panelNotice(focus, intent, mailRevision)}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {ordered === null ? (
                  <Alert className="mt-5" variant="destructive">
                    <AlertTitle>
                      가입 요청 목록을 불러오지 못했습니다
                    </AlertTitle>
                    <AlertDescription className="text-[13px] leading-[19px]">
                      저장된 승인 상태 서비스에 연결하지 못했습니다. 잠시 뒤
                      다시 시도해 주세요.
                    </AlertDescription>
                  </Alert>
                ) : ordered.length === 0 ? (
                  <p className="mt-5 rounded-lg border border-border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">
                    접수된 가입 요청이 없습니다.
                  </p>
                ) : (
                  <>
                    {/* 모바일 PWA는 단일 열 카드로, 데스크톱은 정렬된 표로 보여 준다. 같은 데이터·같은 동작이다. */}
                    <ul className="mt-5 grid gap-2 min-[761px]:hidden">
                      {ordered.map((row) => (
                        <li
                          className={`min-w-0 rounded-lg border border-border p-4 ${
                            row.userId === requested ? "bg-muted/60" : "bg-card"
                          }`}
                          key={row.userId}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-all text-[13px] font-medium">
                              {row.email}
                            </span>
                            <Badge variant={statusBadge(row.status)}>
                              {ACCESS_STATUS_LABELS[row.status]}
                            </Badge>
                            {row.userId === admin.userId ? (
                              <Badge variant="outline">내 계정</Badge>
                            ) : null}
                            {row.isAdmin ? (
                              <Badge variant="secondary">관리자</Badge>
                            ) : null}
                          </div>
                          <dl className="mt-3 grid grid-cols-2 gap-2">
                            <div className="min-w-0">
                              <dt className="text-[11px] text-muted-foreground">
                                요청
                              </dt>
                              <dd className="mt-0.5 text-[12px] whitespace-nowrap">
                                {moment(row.requestedAt)}
                              </dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-[11px] text-muted-foreground">
                                결정
                              </dt>
                              <dd className="mt-0.5 text-[12px] whitespace-nowrap">
                                {moment(row.decidedAt)}
                              </dd>
                            </div>
                          </dl>
                          <div className="mt-3">
                            <RowActions
                              actions={decisionsFor(row.status)}
                              adminId={admin.userId}
                              row={row}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-5 hidden overflow-x-auto rounded-lg border border-border bg-card min-[761px]:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>계정</TableHead>
                            <TableHead>상태</TableHead>
                            <TableHead>요청</TableHead>
                            <TableHead>결정</TableHead>
                            <TableHead className="text-right">동작</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ordered.map((row) => (
                            <TableRow
                              className={
                                row.userId === requested
                                  ? "bg-muted/60"
                                  : undefined
                              }
                              key={row.userId}
                            >
                              <TableCell>
                                <span className="break-all font-medium">
                                  {row.email}
                                </span>
                                <span className="mt-1 flex gap-1.5">
                                  {row.userId === admin.userId ? (
                                    <Badge variant="outline">내 계정</Badge>
                                  ) : null}
                                  {row.isAdmin ? (
                                    <Badge variant="secondary">관리자</Badge>
                                  ) : null}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={statusBadge(row.status)}>
                                  {ACCESS_STATUS_LABELS[row.status]}
                                </Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                                {moment(row.requestedAt)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                                {moment(row.decidedAt)}
                              </TableCell>
                              <TableCell>
                                <RowActions
                                  actions={decisionsFor(row.status)}
                                  adminId={admin.userId}
                                  row={row}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </AdminDecisionBoundary>

              <p className="mt-3 text-[11px] leading-[17px] text-muted-foreground">
                자신의 관리자 권한은 스스로 해제할 수 없습니다. 접근 해제된
                계정은 다시 로그인해도 자동 승인되지 않으며, 재승인은 이
                화면에서만 할 수 있습니다.
              </p>
            </section>
          </>
        }
        pendingCount={pendingCount}
        sync={<AdminSyncHealth view={syncHealth} />}
      />
    </AppShell>
  );
}
