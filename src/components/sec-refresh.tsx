"use client";

import {
  CacheRefresh,
  type CacheRefreshLabels,
} from "@/components/cache-refresh";

/** SEC 13F 화면이 허용하는 동기화 대상 식별자다. URL·cooldown 키는 이 닫힌 목록으로만 만든다. */
export type SecRefreshManager =
  | "stanley"
  | "laffont"
  | "gerstner"
  | "tepper"
  | "aschenbrenner";

type SecRefreshProps = Readonly<{
  manager: SecRefreshManager;
  name: string;
  stale: boolean;
  status: "ready" | "empty" | "unconfigured" | "error";
  lastAttemptAt: string | null;
  lastError: string | null;
  syncing: boolean;
}>;

function createLabels(name: string): CacheRefreshLabels {
  return {
    configurationTitle: `${name} 동기화 설정 필요`,
    configurationFallback:
      "서버 동기화 설정 후 다시 확인할 수 있습니다. 저장된 공시가 있으면 아래에서 계속 조회할 수 있습니다.",
    alertTitle: `${name} 캐시 갱신 상태`,
    failureTitle: `${name} 갱신 요청 실패`,
    updating: `${name}의 공식 SEC 13F 캐시를 갱신하는 중입니다.`,
    polling: "다른 갱신 작업의 결과를 확인하고 있습니다.",
    updated: "새 공시 캐시를 반영했습니다.",
    unchanged: "저장된 캐시가 최신입니다.",
    idle: "저장된 캐시 상태를 확인하고 있습니다.",
    requestFailed: "동기화 요청에 실패했습니다. 다시 시도해 주세요.",
    networkFailed:
      "네트워크 문제로 동기화 요청에 실패했습니다. 다시 시도해 주세요.",
    pollingTimeout:
      "갱신 결과를 아직 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    requesting: "요청 중",
    manualRetry: "다시 시도",
  };
}

/**
 * Stanley 및 일반 SEC 13F 관리자의 캐시 갱신 제어부다.
 * 입력 manager는 닫힌 유니온이며, CacheRefresh가 stale 자동 시도·lease 관찰·수동 재시도를 일관되게 처리한다.
 */
export function SecRefresh({ manager, name, ...view }: SecRefreshProps) {
  return (
    <CacheRefresh
      automaticCooldownKey={`guru-tracker:${manager}:last-automatic-sync-attempt`}
      endpoint={`/api/sync/${manager}`}
      labels={createLabels(name)}
      {...view}
    />
  );
}
