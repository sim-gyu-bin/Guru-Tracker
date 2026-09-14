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
export interface StanleyView {
  snapshot: SecSnapshot | null;
  previousSnapshot: SecSnapshot | null;
  status: "ready" | "empty" | "unconfigured" | "error";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  syncing: boolean;
  stale: boolean;
}
