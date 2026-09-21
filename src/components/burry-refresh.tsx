"use client";

import {
  CacheRefresh,
  type CacheRefreshLabels,
} from "@/components/cache-refresh";

/**
 * 서버 조회 상태를 그대로 받는 Burry SEC 13F 캐시 갱신 제어부의 입력이다.
 * 값은 저장된 캐시에서만 오며 이 컴포넌트는 상태를 바꾸지 않고 표시와 요청만 담당한다.
 */
type BurryRefreshProps = Readonly<{
  stale: boolean;
  status: "ready" | "empty" | "unconfigured" | "error";
  lastAttemptAt: string | null;
  lastError: string | null;
  syncing: boolean;
}>;

/**
 * 문구는 대상 이름을 포함해 같은 SEC 판독기를 쓰는 Stanley 갱신 안내와 구분한다.
 * 옵션 손익·수익률을 언급하지 않고 캐시 갱신 상태만 전달한다.
 */
const labels: CacheRefreshLabels = {
  configurationTitle: "Michael Burry 동기화 설정 필요",
  configurationFallback:
    "서버 동기화 설정 후 다시 확인할 수 있습니다. 저장된 공시가 있으면 아래에서 계속 조회할 수 있습니다.",
  alertTitle: "Michael Burry 캐시 갱신 상태",
  failureTitle: "Michael Burry 갱신 요청 실패",
  updating: "Michael Burry의 공식 SEC 13F 캐시를 갱신하는 중입니다.",
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

/**
 * Michael Burry SEC 13F 캐시의 갱신 제어부다.
 * 수집·쿨다운·폴링 정책은 공통 CacheRefresh가 담당하고, 이 컴포넌트는 Burry 엔드포인트와 문구·cooldown 키만 고정한다.
 * cooldown 키를 출처별로 분리해 Stanley 갱신과 서로의 자동 시도를 막지 않는다.
 */
export function BurryRefresh({
  stale,
  status,
  lastAttemptAt,
  lastError,
  syncing,
}: BurryRefreshProps) {
  return (
    <CacheRefresh
      automaticCooldownKey="guru-tracker:burry:last-automatic-sync-attempt"
      endpoint="/api/sync/burry"
      labels={labels}
      lastAttemptAt={lastAttemptAt}
      lastError={lastError}
      stale={stale}
      status={status}
      syncing={syncing}
    />
  );
}
