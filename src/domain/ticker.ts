import type { SecHolding } from "./sec";

/** OpenFIGI가 CUSIP·CINS에 연결한 현재 미국 시장 참조 티커다. 13F 원문이나 과거 기준일의 티커를 뜻하지 않는다. */
export interface TickerReference {
  ticker: string;
  figi: string;
  /** 공급자의 변경 시점이 아니라 매핑 응답을 확인한 서버 시각(UTC)이다. */
  matchedAt: string;
}

/** 티커 조회 결과다. 매핑 불명과 일시적인 공급자 실패를 구분하며 원본 공시 스냅샷에는 저장하지 않는다. */
export interface TickerLookup {
  byCusip: Record<string, TickerReference>;
  unresolvedCusips: string[];
  unavailableCusips: string[];
}

/** SH 항목만 미국 주식·예탁증서·ETF 참조 티커를 사용한다. PUT/CALL은 같은 CUSIP·CINS의 기초자산 티커이며 PRN을 주식으로 해석하지 않는다. */
export function getTickerReference(
  holding: Pick<SecHolding, "cusip" | "shareType">,
  byCusip: TickerLookup["byCusip"],
): TickerReference | undefined {
  return holding.shareType === "SH" ? byCusip[holding.cusip] : undefined;
}
