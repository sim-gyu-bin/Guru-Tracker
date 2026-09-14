"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type SyncStatus = "updated" | "unchanged" | "busy" | "failed" | "fresh";

type StanleyRefreshProps = Readonly<{
  stale: boolean;
  status: "ready" | "empty" | "unconfigured" | "error";
  lastAttemptAt: string | null;
  lastError: string | null;
  syncing: boolean;
}>;

const automaticCooldownKey = "guru-tracker:stanley:last-automatic-sync-attempt";
const automaticCooldownMs = 60_000;
const maxPollingAttempts = 12;
const pollingIntervalMs = 5_000;

function readStoredAttemptTime(): number | null {
  try {
    const timestamp = Number(
      window.sessionStorage.getItem(automaticCooldownKey),
    );
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function storeAttemptTime(timestamp: number) {
  try {
    window.sessionStorage.setItem(automaticCooldownKey, String(timestamp));
  } catch {
    // 개인정보 보호 설정으로 저장소가 차단되어도 메모리 내 cooldown은 유지한다.
  }
}

/**
 * Stanley 캐시가 stale 또는 비어 있을 때 cooldown 안에서 한 번만 동기화를 요청하는 제어부다.
 * 설정 누락은 서버 조회 상태로만 판단하고, 503을 포함한 요청 실패에는 항상 재시도를 제공한다.
 */
export function StanleyRefresh({
  stale,
  status,
  lastAttemptAt,
  lastError,
  syncing,
}: StanleyRefreshProps) {
  const router = useRouter();
  const [requestStatus, setRequestStatus] = useState<SyncStatus | null>(null);
  const [message, setMessage] = useState<string | null>(lastError);
  const [isRequesting, setIsRequesting] = useState(false);
  const automaticAttemptAt = useRef<number | null>(null);
  const automaticRequestInFlight = useRef(false);
  const pollingAttempts = useRef(0);
  const needsAutomaticSync = stale || status === "empty";
  const isUnconfigured = status === "unconfigured";

  useEffect(() => {
    setMessage(lastError);
  }, [lastError]);

  const requestSync = useCallback(
    async (automatic = false) => {
      if (isRequesting || isUnconfigured) return;

      if (automatic) {
        const attemptedAt = Date.now();
        automaticAttemptAt.current = attemptedAt;
        storeAttemptTime(attemptedAt);
        automaticRequestInFlight.current = true;
      }

      pollingAttempts.current = 0;
      setRequestStatus(null);
      setIsRequesting(true);
      setMessage(null);

      try {
        const response = await fetch("/api/sync/stanley", {
          method: "POST",
          signal: AbortSignal.timeout(65_000),
        });
        const body = (await response.json().catch(() => null)) as {
          status?: SyncStatus;
          message?: string;
        } | null;

        if (!response.ok || !body?.status) {
          setRequestStatus("failed");
          setMessage(
            body?.message ?? "동기화 요청에 실패했습니다. 다시 시도해 주세요.",
          );
          return;
        }

        setRequestStatus(body.status);
        setMessage(body.message ?? null);
        if (body.status !== "failed") router.refresh();
      } catch {
        setRequestStatus("failed");
        setMessage(
          "네트워크 문제로 동기화 요청에 실패했습니다. 다시 시도해 주세요.",
        );
      } finally {
        automaticRequestInFlight.current = false;
        setIsRequesting(false);
      }
    },
    [isRequesting, isUnconfigured, router],
  );

  useEffect(() => {
    if (
      !needsAutomaticSync ||
      isUnconfigured ||
      automaticRequestInFlight.current
    )
      return;

    const lastAttemptTimestamp = lastAttemptAt
      ? Date.parse(lastAttemptAt)
      : Number.NaN;
    const newestAttempt = Math.max(
      Number.isNaN(lastAttemptTimestamp) ? 0 : lastAttemptTimestamp,
      readStoredAttemptTime() ?? 0,
      automaticAttemptAt.current ?? 0,
    );
    if (Date.now() - newestAttempt < automaticCooldownMs) return;

    void requestSync(true);
  }, [isUnconfigured, lastAttemptAt, needsAutomaticSync, requestSync]);

  useEffect(() => {
    if (!syncing && requestStatus !== "busy") return;
    if (pollingAttempts.current >= maxPollingAttempts) return;
    // 한 번의 timeout은 서버 props가 같으면 다시 예약되지 않는다. 제한된 interval로 lease 완료를 관찰한다.
    const intervalId = window.setInterval(() => {
      pollingAttempts.current += 1;
      router.refresh();
      if (pollingAttempts.current >= maxPollingAttempts) {
        window.clearInterval(intervalId);
        setRequestStatus("failed");
        setMessage(
          "갱신 결과를 아직 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    }, pollingIntervalMs);
    return () => window.clearInterval(intervalId);
  }, [requestStatus, router, syncing]);

  useEffect(() => {
    if (!syncing && !stale && requestStatus === "busy") {
      setRequestStatus("fresh");
      setMessage(null);
    }
  }, [requestStatus, syncing, stale]);

  if (isUnconfigured) {
    return (
      <Alert
        aria-live="polite"
        className="mb-5 border-warning/30 bg-warning/10 text-warning"
        role="status"
      >
        <AlertTitle>동기화 설정 필요</AlertTitle>
        <AlertDescription className="text-warning/90">
          {lastError ??
            "서버 동기화 설정 후 다시 확인할 수 있습니다. 저장된 공시가 있으면 아래에서 계속 조회할 수 있습니다."}
        </AlertDescription>
      </Alert>
    );
  }

  const showManualRetry = requestStatus === "failed" || status === "error";
  const isPolling = syncing || requestStatus === "busy";
  const syncLabel = isRequesting
    ? "공식 SEC 13F 캐시를 갱신하는 중입니다."
    : isPolling
      ? "다른 갱신 작업의 결과를 확인하고 있습니다."
      : requestStatus === "updated"
        ? "새 공시 캐시를 반영했습니다."
        : requestStatus === "unchanged" || requestStatus === "fresh"
          ? "저장된 캐시가 최신입니다."
          : null;

  if (!needsAutomaticSync && !showManualRetry && !syncLabel && !message)
    return null;

  return (
    <Alert
      aria-live="polite"
      className={`mb-5 ${
        showManualRetry
          ? "border-destructive/25 bg-destructive/10"
          : "border-border bg-muted/40"
      }`}
      role="status"
      variant={showManualRetry ? "destructive" : "default"}
    >
      <AlertTitle>
        {showManualRetry ? "갱신 요청 실패" : "캐시 갱신 상태"}
      </AlertTitle>
      <AlertDescription>
        {message ?? syncLabel ?? "저장된 캐시 상태를 확인하고 있습니다."}
      </AlertDescription>
      {showManualRetry ? (
        <div className="mt-2">
          <Button
            className="min-h-11 min-[761px]:min-h-9"
            disabled={isRequesting}
            onClick={() => void requestSync()}
            type="button"
            variant="outline"
          >
            {isRequesting ? "요청 중" : "다시 시도"}
          </Button>
        </div>
      ) : null}
    </Alert>
  );
}
