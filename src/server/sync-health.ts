import "server-only";

import {
  parseSyncHealthView,
  type SyncHealthView,
} from "../domain/sync-health";
import { serviceConfig, serviceRpc } from "./supabase";

/**
 * 관리자 화면 전용 읽기. 호출자는 반드시 requireAdminPage 완료 후에 호출해야 한다.
 * service_role은 RLS를 우회하므로 이 함수를 공개 라우트나 일반 사용자 조회에 연결하지 않는다.
 * 기존 no-store RPC를 한 번만 호출하며 수집·동기화·상태 변경은 하지 않는다.
 * 설정·스키마 누락과 조회 실패를 값으로 반환해 기존 승인 UI에 예외를 전파하지 않는다.
 */
export async function getSyncHealthView(): Promise<SyncHealthView> {
  try {
    if (!serviceConfig())
      return { status: "unconfigured", checkedAt: null, rows: [] };
    const response = await serviceRpc("admin_sync_health", {});
    if (response.status === 404)
      return { status: "unconfigured", checkedAt: null, rows: [] };
    if (response.status !== 200)
      return { status: "error", checkedAt: null, rows: [] };
    return parseSyncHealthView(response.body);
  } catch {
    return { status: "error", checkedAt: null, rows: [] };
  }
}
