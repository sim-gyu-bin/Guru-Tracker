/**
 * 같은 SEC 13F 수집·저장 경로를 공유하는 관리자다.
 * 값은 저장 테이블·RPC 접두사(stanley_state, burry_commit 등)와 Storage 원문 접두사에 그대로 쓰이므로
 * 소문자 식별자만 두며 화면·요청에서 임의 문자열을 받지 않는다.
 */
export type SecManager = "stanley" | "burry";

/** SEC 13F 공시 금액은 USD, 수량은 원문 단위다. 개인 계좌나 실시간 거래를 나타내지 않는다. */
export interface SecHolding {
  issuer: string;
  titleOfClass: string;
  cusip: string;
  valueUsd: string;
  shares: string;
  shareType: "SH" | "PRN";
  putCall: "PUT" | "CALL" | null;
}

/** 원문 검증을 통과한 한 공시의 조회 스냅샷이다. 날짜는 SEC 보고일/제출일이며 수집 시각과 구별한다. */
export interface SecSnapshot {
  accession: string;
  cik: string;
  managerName: string;
  reportDate: string;
  filingDate: string;
  form: string;
  sourceUrl: string;
  informationTableUrl: string;
  version: number;
  holdings: SecHolding[];
}

/** 화면은 저장된 스냅샷을 먼저 읽는다. 설정 누락·오류·빈 결과를 성공이나 최신 상태로 표시하지 않는다. */
export interface SecView {
  snapshot: SecSnapshot | null;
  previousSnapshot: SecSnapshot | null;
  status: "ready" | "empty" | "unconfigured" | "error";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  syncing: boolean;
  stale: boolean;
}
