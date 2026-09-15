/**
 * 차트·목록에 공통으로 쓰는 평가금액 구성 한 항목이다.
 * SEC 13F와 ARK는 금액 단위와 식별자 의미가 다르므로, 표시 문자열과 보조 설명은
 * 각 출처 어댑터가 원문 의미를 살려 만들어 넘기고 공통 컴포넌트는 다시 해석하지 않는다.
 */
export interface AllocationSlice {
  key: string;
  /** 회사·발행인 이름이며 원문 표기를 그대로 쓴다. */
  label: string;
  /** 원문 또는 참조 티커 표시 문자열이다. 확인되지 않았으면 null이며 화면은 "—"로 표시한다. */
  ticker: string | null;
  /** 종류·식별자·비중처럼 출처마다 의미가 다른 보조 설명 줄이다. */
  detail: string;
  /** 이미 포맷된 USD 표시 문자열이다. 공통 컴포넌트는 금액을 다시 계산하지 않는다. */
  amountLabel: string;
  /** 도넛 조각 크기와 목록 비중에 함께 쓰는 0~100 number다. */
  percent: number;
  /** 상위 항목 밖을 묶은 "기타" 조각인지 여부다. */
  isOther: boolean;
}

/** 한 출처의 평가금액 구성 차트에 필요한 표시 값 모음이다. 집계와 포맷은 어댑터가 끝낸 뒤 전달한다. */
export interface AllocationChartView {
  slices: AllocationSlice[];
  /** 도넛 중심 위쪽에 표시할 짧은 설명이다(예: "상위 5개"). */
  topLabel: string;
  /** 도넛 중심에 표시할 비중이다. slices가 비어 있으면 쓰이지 않는다. */
  topPercent: number;
  /** 조각이 없을 때 차트 자리에 표시할 안내다. */
  emptyMessage: string;
  /**
   * 도넛을 그릴 수 없을 때 목록·도넛을 포함한 차트 영역 전체를 대신할 안내다.
   * 예를 들어 음수 평가액이 섞인 자료는 양수만 더한 비중 구성으로 표현할 수 없으므로 어댑터가 이 값을 채운다.
   */
  unavailableMessage?: string;
}
