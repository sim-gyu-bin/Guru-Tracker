"use client";

import {
  CacheRefresh,
  type CacheRefreshLabels,
} from "@/components/cache-refresh";
import type { ArkFund } from "@/domain/ark";

type ArkRefreshProps = Readonly<{
  fund: ArkFund;
  stale: boolean;
  status: "ready" | "empty" | "unconfigured" | "error";
  lastAttemptAt: string | null;
  lastError: string | null;
  syncing: boolean;
}>;

const labels: CacheRefreshLabels = {
  configurationTitle: "동기화 설정 필요",
  configurationFallback:
    "서버 동기화 설정 후 다시 확인할 수 있습니다. 저장된 펀드 자료가 있으면 아래에서 계속 조회할 수 있습니다.",
  alertTitle: "캐시 갱신 상태",
  failureTitle: "갱신 요청 실패",
  updating: "공식 ARK 보유 자료를 갱신하는 중입니다.",
  polling: "다른 갱신 작업의 결과를 확인하고 있습니다.",
  updated: "새 ARK 보유 자료를 반영했습니다.",
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
 * ARK 펀드 보유 자료 캐시의 갱신 제어부다.
 * 쿨다운과 폴링 정책은 공통 CacheRefresh를 그대로 쓰고, 펀드별 cooldown 키와 요청 URL만 분리한다.
 */
export function ArkRefresh({
  fund,
  stale,
  status,
  lastAttemptAt,
  lastError,
  syncing,
}: ArkRefreshProps) {
  return (
    <CacheRefresh
      // 펀드를 바꾸면 제어부를 새로 만들어야 한다. 그렇지 않으면 ref·requestStatus가 재사용되어
      // 앞 펀드의 쿨다운·실패 문구가 다음 펀드의 자동 수집을 막는다.
      key={fund}
      automaticCooldownKey={`guru-tracker:ark:${fund}:last-automatic-sync-attempt`}
      endpoint={`/api/sync/ark?fund=${fund}`}
      labels={labels}
      lastAttemptAt={lastAttemptAt}
      lastError={lastError}
      stale={stale}
      status={status}
      syncing={syncing}
    />
  );
}
