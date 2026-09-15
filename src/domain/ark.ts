/** Cathie Wood 화면에서 추적하는 ARK의 6개 액티브 주식 ETF다. 지수형·구조화 상품과 개인 계좌는 포함하지 않는다. */
export const ARK_FUNDS = [
  { ticker: "ARKK", name: "ARK Innovation ETF" },
  { ticker: "ARKQ", name: "ARK Autonomous Technology & Robotics ETF" },
  { ticker: "ARKW", name: "ARK Next Generation Technology ETF" },
  { ticker: "ARKG", name: "ARK Genomic Revolution ETF" },
  { ticker: "ARKF", name: "ARK Blockchain & Fintech Innovation ETF" },
  { ticker: "ARKX", name: "ARK Space & Defense Innovation ETF" },
] as const;

/** 펀드는 외부 입력을 검증한 뒤에만 수집 URL과 DB 키로 사용한다. */
export type ArkFund = (typeof ARK_FUNDS)[number]["ticker"];

/** 공식 CSV 한 행이다. 티커 공백·거래소 접미사·비표준 식별자를 보존하고 주식/현금/비상장 자산을 임의 분류하지 않는다. */
export interface ArkHolding {
  id: string;
  company: string;
  ticker: string | null;
  identifier: string;
  /** 원문의 수량을 정밀도 손실 없는 십진 문자열로 보존한다. SH/PRN으로 추정하지 않는다. */
  shares: string;
  /** 센트를 포함하는 USD 십진 문자열이다. 음수인 원문 값도 보존한다. */
  valueUsd: string;
  /** 원문이 공개한 퍼센트 단위의 반올림 비중이며 합계가 정확히 100일 필요는 없다. */
  weightPercent: string;
}

/** 한 펀드의 공식 일별 보유 스냅샷이다. reportDate는 원문 날짜이며 수집 시각·매매 시각이 아니다. */
export interface ArkSnapshot {
  fund: ArkFund;
  reportDate: string;
  sourceUrl: string;
  holdingsUrl: string;
  version: number;
  holdings: ArkHolding[];
}

/** 저장된 보유 자료를 우선 표시한다. 수집 실패와 lease 상태는 기존 스냅샷과 별도로 전달한다. */
export interface ArkView {
  fund: ArkFund;
  snapshot: ArkSnapshot | null;
  previousSnapshot: ArkSnapshot | null;
  status: "ready" | "empty" | "unconfigured" | "error";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  syncing: boolean;
  stale: boolean;
}

/** 허용된 펀드만 받으며 임의 URL·테이블 식별자를 외부에서 주입하지 못하게 한다. */
export function isArkFund(value: unknown): value is ArkFund {
  return (
    typeof value === "string" && ARK_FUNDS.some((fund) => fund.ticker === value)
  );
}
