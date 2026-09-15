"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type SyncStatus = "updated" | "unchanged" | "busy" | "failed" | "fresh";

/** 출처별 문구를 그대로 유지하기 위해 화면 어댑터가 넘기는 안내 문구 묶음이다. */
export interface CacheRefreshLabels {
  configurationTitle: string;
  configurationFallback: string;
  alertTitle: string;
  failureTitle: string;
  updating: string;
  polling: string;
  updated: string;
  unchanged: string;
  idle: string;
  requestFailed: string;
  networkFailed: string;
  pollingTimeout: string;
  requesting: string;
  manualRetry: string;
}

export type CacheRefreshProps = Readonly<{
  /** 같은 사이트 안의 동기화 엔드포인트다. 대상 선택은 이미 이 URL에 포함되어 있어야 한다. */
  endpoint: string;
  /** 자동 시도 cooldown을 출처·대상별로 분리하는 sessionStorage 키다. */
  automaticCooldownKey: string;
  labels: CacheRefreshLabels;
  stale: boolean;
  status: "ready" | "empty" | "unconfigured" | "error";
  lastAttemptAt: string | null;
  lastError: string | null;
  syncing: boolean;
}>;

const automaticCooldownMs = 60_000;
const maxPollingAttempts = 12;
const pollingIntervalMs = 5_000;
const requestTimeoutMs = 65_000;

function readStoredAttemptTime(key: string): number | null {
  try {
    const timestamp = Number(window.sessionStorage.getItem(key));
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function storeAttemptTime(key: string, timestamp: number) {
  try {
    window.sessionStorage.setItem(key, String(timestamp));
  } catch {
    // 개인정보 보호 설정으로 저장소가 차단되어도 메모리 내 cooldown은 유지한다.
  }
}

/**
 * 저장된 캐시가 stale 또는 비어 있을 때 cooldown 안에서 한 번만 동기화를 요청하는 공통 제어부다.
 * 여러 출처가 같은 정책을 공유하도록 엔드포인트·cooldown 키·문구만 밖에서 받는다.
 * 설정 누락은 서버 조회 상태로만 판단하고, 503을 포함한 요청 실패에는 항상 수동 재시도를 제공한다.
 */
export function CacheRefresh({
  endpoint,
  automaticCooldownKey,
  labels,
  stale,
  status,
  lastAttemptAt,
  lastError,
  syncing,
}: CacheRefreshProps) {
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
        storeAttemptTime(automaticCooldownKey, attemptedAt);
        automaticRequestInFlight.current = true;
      }

      pollingAttempts.current = 0;
      setRequestStatus(null);
      setIsRequesting(true);
      setMessage(null);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        const body = (await response.json().catch(() => null)) as {
          status?: SyncStatus;
          message?: string;
        } | null;

        if (!response.ok || !body?.status) {
          setRequestStatus("failed");
          setMessage(body?.message ?? labels.requestFailed);
          return;
        }

        setRequestStatus(body.status);
        setMessage(body.message ?? null);
        if (body.status !== "failed") router.refresh();
      } catch {
        setRequestStatus("failed");
        setMessage(labels.networkFailed);
      } finally {
        automaticRequestInFlight.current = false;
        setIsRequesting(false);
      }
    },
    [
      automaticCooldownKey,
      endpoint,
      isRequesting,
      isUnconfigured,
      labels.networkFailed,
      labels.requestFailed,
      router,
    ],
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
      readStoredAttemptTime(automaticCooldownKey) ?? 0,
      automaticAttemptAt.current ?? 0,
    );
    if (Date.now() - newestAttempt < automaticCooldownMs) return;

    void requestSync(true);
  }, [
    automaticCooldownKey,
    isUnconfigured,
    lastAttemptAt,
    needsAutomaticSync,
    requestSync,
  ]);

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
        setMessage(labels.pollingTimeout);
      }
    }, pollingIntervalMs);
    return () => window.clearInterval(intervalId);
  }, [labels.pollingTimeout, requestStatus, router, syncing]);

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
        <AlertTitle>{labels.configurationTitle}</AlertTitle>
        <AlertDescription className="text-warning/90">
          {lastError ?? labels.configurationFallback}
        </AlertDescription>
      </Alert>
    );
  }

  const showManualRetry = requestStatus === "failed" || status === "error";
  const isPolling = syncing || requestStatus === "busy";
  const syncLabel = isRequesting
    ? labels.updating
    : isPolling
      ? labels.polling
      : requestStatus === "updated"
        ? labels.updated
        : requestStatus === "unchanged" || requestStatus === "fresh"
          ? labels.unchanged
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
        {showManualRetry ? labels.failureTitle : labels.alertTitle}
      </AlertTitle>
      {/* 갱신 API가 성공해도 뒤따른 캐시 조회는 실패할 수 있다. 현재 조회 오류를 이전 성공 문구로 가리지 않는다. */}
      <AlertDescription>
        {status === "error"
          ? (lastError ?? labels.failureTitle)
          : (message ?? syncLabel ?? labels.idle)}
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
            {isRequesting ? labels.requesting : labels.manualRetry}
          </Button>
        </div>
      ) : null}
    </Alert>
  );
}
