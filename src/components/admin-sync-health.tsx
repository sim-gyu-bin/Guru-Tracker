import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  SyncHealthRow,
  SyncHealthStatus,
  SyncHealthView,
  SyncScheduleStatus,
} from "@/domain/sync-health";

const koreanTime = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});

/** 수집·조회 시각을 서버 시간대와 무관하게 한국 시간으로 표기한다. */
function moment(value: string | null): string {
  if (!value) return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "확인 불가";
  return koreanTime.format(at);
}

/** 실제 수집 결과 상태의 문구·보조 배지 모양이다. 색상 없이도 문구로 상태를 구분한다. */
const HEALTH_PRESENTATION: Readonly<
  Record<
    SyncHealthStatus,
    Readonly<{
      label: string;
      variant: "secondary" | "outline" | "destructive";
    }>
  >
> = {
  healthy: { label: "정상", variant: "secondary" },
  syncing: { label: "진행 중", variant: "outline" },
  delayed: { label: "지연", variant: "destructive" },
  failed: { label: "실패", variant: "destructive" },
  empty: { label: "수집 전", variant: "outline" },
};

/** Cron 등록·활성 상태의 문구·보조 배지 모양이다. 수집 결과와 독립적으로 표시한다. */
const SCHEDULE_PRESENTATION: Readonly<
  Record<
    SyncScheduleStatus,
    Readonly<{
      label: string;
      variant: "secondary" | "outline" | "destructive";
    }>
  >
> = {
  active: { label: "Cron 활성", variant: "secondary" },
  disabled: { label: "Cron 비활성", variant: "outline" },
  missing: { label: "Cron 미등록", variant: "destructive" },
  duplicate: { label: "Cron 중복", variant: "destructive" },
};

/** 한 수집 단위의 대상·출처·수집 결과·Cron 설정을 읽기 전용으로 렌더링한다. */
function SyncHealthCard({ row }: Readonly<{ row: SyncHealthRow }>) {
  const health = HEALTH_PRESENTATION[row.health];
  const scheduleStatus = SCHEDULE_PRESENTATION[row.scheduleStatus];

  return (
    <li className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 break-words text-base font-medium">{row.label}</p>
        <Badge className="text-sm" variant={health.variant}>
          {health.label}
        </Badge>
        <Badge className="text-sm" variant={scheduleStatus.variant}>
          {scheduleStatus.label}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{row.source}</p>
      <dl className="mt-3 grid gap-2 text-sm">
        <SyncHealthDefinition
          label="마지막 성공"
          value={moment(row.lastSuccessAt)}
        />
        <SyncHealthDefinition
          label="마지막 시도"
          value={moment(row.lastAttemptAt)}
        />
        <SyncHealthDefinition
          label="실제 Cron 일정"
          value={
            row.scheduleStatus === "duplicate"
              ? "중복 작업의 일정 확인 필요"
              : (row.schedule ?? "등록된 일정 없음")
          }
          wrap
        />
        <SyncHealthDefinition
          label="데이터 버전"
          value={row.datasetVersion}
          wrap
        />
      </dl>
    </li>
  );
}

/** 카드 내부의 짧은 필드명과 줄바꿈이 필요한 실제 일정·버전을 함께 표시한다. */
function SyncHealthDefinition({
  label,
  value,
  wrap = false,
}: Readonly<{ label: string; value: string; wrap?: boolean }>) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={`mt-0.5 text-foreground ${
          wrap ? "[overflow-wrap:anywhere]" : "whitespace-normal"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * 관리자용 읽기 전용 동기화 상태판.
 *
 * 서버가 계산한 수집 건강과 실제 Cron 등록 상태를 분리해 표시한다. `error`·`unconfigured` 뷰는
 * 가입 승인 화면의 실패로 전파하지 않으며, 공시 기준일과 수집 성공 시각이 같은 의미가 아님을 알린다.
 */
export function AdminSyncHealth({ view }: { view: SyncHealthView }) {
  if (view.status === "unconfigured") {
    return (
      <section aria-labelledby="sync-health-heading" className="mt-8">
        <h2 className="text-xl font-semibold" id="sync-health-heading">
          동기화 상태
        </h2>
        <Alert className="mt-3">
          <AlertTitle>동기화 상태가 아직 설정되지 않았습니다</AlertTitle>
          <AlertDescription className="text-sm leading-6">
            수집 상태와 Cron 등록 정보를 확인할 수 없습니다. 가입 승인 기능에는
            영향을 주지 않습니다.
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  if (view.status === "error") {
    return (
      <section aria-labelledby="sync-health-heading" className="mt-8">
        <h2 className="text-xl font-semibold" id="sync-health-heading">
          동기화 상태
        </h2>
        <Alert className="mt-3" variant="destructive">
          <AlertTitle>동기화 상태를 불러오지 못했습니다</AlertTitle>
          <AlertDescription className="text-sm leading-6">
            상태 조회에 실패했습니다. 가입 승인 기능에는 영향을 주지 않습니다.
            잠시 뒤 다시 확인해 주세요.
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  return (
    <section aria-labelledby="sync-health-heading" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-xl font-semibold" id="sync-health-heading">
            동기화 상태
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            추적 대상 8명과 연결된 SEC 13F 6명, House PTR 1명, ARK holdings
            6펀드의 총 13개 수집 단위입니다.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          조회: {moment(view.checkedAt)} (한국시간)
        </p>
      </div>
      <p className="mt-2 max-w-[720px] text-sm leading-6 text-muted-foreground">
        모든 시각은 한국 시간입니다. Cron 활성은 일정 등록 상태일 뿐 수집 성공을
        뜻하지 않습니다. 마지막 성공 시각은 공시 기준일과 다를 수 있습니다.
      </p>

      {view.rows.length === 0 ? (
        <Alert className="mt-4">
          <AlertTitle>표시할 수집 단위가 없습니다</AlertTitle>
          <AlertDescription className="text-sm leading-6">
            동기화 상태 서비스는 응답했지만 등록된 수집 단위를 받지 못했습니다.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <ul className="mt-4 grid gap-2 min-[761px]:hidden">
            {view.rows.map((row) => (
              <SyncHealthCard key={row.key} row={row} />
            ))}
          </ul>

          <div className="mt-4 hidden rounded-lg border border-border bg-card min-[761px]:block">
            <Table>
              <TableCaption className="sr-only">
                수집 단위별 동기화 결과와 실제 Cron 등록 상태
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>대상</TableHead>
                  <TableHead>출처</TableHead>
                  <TableHead>수집 상태</TableHead>
                  <TableHead>마지막 성공</TableHead>
                  <TableHead>마지막 시도</TableHead>
                  <TableHead>실제 Cron 일정·상태</TableHead>
                  <TableHead>버전</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.map((row) => {
                  const health = HEALTH_PRESENTATION[row.health];
                  const scheduleStatus =
                    SCHEDULE_PRESENTATION[row.scheduleStatus];
                  return (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {row.source}
                      </TableCell>
                      <TableCell>
                        <Badge className="text-sm" variant={health.variant}>
                          {health.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {moment(row.lastSuccessAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {moment(row.lastAttemptAt)}
                      </TableCell>
                      <TableCell className="min-w-48">
                        <div className="flex min-w-0 flex-col items-start gap-1">
                          <Badge
                            className="text-sm"
                            variant={scheduleStatus.variant}
                          >
                            {scheduleStatus.label}
                          </Badge>
                          <span className="[overflow-wrap:anywhere] text-sm text-muted-foreground">
                            {row.scheduleStatus === "duplicate"
                              ? "중복 작업의 일정 확인 필요"
                              : (row.schedule ?? "등록된 일정 없음")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-40 [overflow-wrap:anywhere] text-sm text-muted-foreground">
                        {row.datasetVersion}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
