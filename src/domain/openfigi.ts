import type { TickerLookup } from "./ticker";

function isFigi(value: unknown): value is string {
  return typeof value === "string" && /^BBG[A-Z0-9]{9}$/.test(value);
}

/**
 * 요청 순서의 exact CUSIP·CINS와 OpenFIGI 응답을 연결한다. 이름으로 식별하지 않는다.
 * 미국 Equity의 유일한 ticker/FIGI 조합만 참조 메타데이터로 반환한다.
 * 정상 no-match·모호성은 미매핑, 구조 오류·공급자 error는 throw하여 실패 캐싱을 막는다.
 * matchedAt은 서버의 응답 확인 UTC 시각이며 공시 기준일·티커 변경 시각이 아니다.
 */
export function parseOpenFigiResponse(
  cusips: string[],
  payload: unknown,
  matchedAt: string,
): Pick<TickerLookup, "byCusip" | "unresolvedCusips"> {
  if (!Array.isArray(payload) || payload.length !== cusips.length) {
    throw new Error("OPENFIGI_INVALID_RESPONSE");
  }
  const byCusip: TickerLookup["byCusip"] = {};
  const unresolvedCusips: string[] = [];

  for (let index = 0; index < cusips.length; index += 1) {
    const cusip = cusips[index];
    const result: unknown = payload[index];
    if (
      typeof result !== "object" ||
      result === null ||
      Array.isArray(result) ||
      "error" in result
    ) {
      throw new Error("OPENFIGI_INVALID_RESPONSE");
    }
    if ("warning" in result) {
      if (
        typeof result.warning !== "string" ||
        result.warning.trim().length === 0 ||
        "data" in result
      ) {
        throw new Error("OPENFIGI_INVALID_RESPONSE");
      }
      unresolvedCusips.push(cusip);
      continue;
    }
    if (!("data" in result) || !Array.isArray(result.data)) {
      throw new Error("OPENFIGI_INVALID_RESPONSE");
    }

    const candidates = new Map<string, { ticker: string; figi: string }>();
    for (const candidate of result.data) {
      if (
        typeof candidate !== "object" ||
        candidate === null ||
        Array.isArray(candidate) ||
        !isFigi(candidate.figi) ||
        typeof candidate.ticker !== "string" ||
        !/^[\x21-\x7e]{1,32}$/.test(candidate.ticker) ||
        typeof candidate.exchCode !== "string" ||
        candidate.exchCode.length === 0 ||
        typeof candidate.marketSector !== "string" ||
        candidate.marketSector.length === 0 ||
        (candidate.compositeFIGI !== undefined &&
          candidate.compositeFIGI !== null &&
          !isFigi(candidate.compositeFIGI))
      ) {
        throw new Error("OPENFIGI_INVALID_RESPONSE");
      }
      if (candidate.exchCode !== "US" || candidate.marketSector !== "Equity") {
        continue;
      }
      // 거래소별 FIGI가 같은 미국 composite를 가리키는 경우에만 중복을 합친다.
      const figi = isFigi(candidate.compositeFIGI)
        ? candidate.compositeFIGI
        : candidate.figi;
      const ticker = candidate.ticker;
      candidates.set(JSON.stringify([ticker, figi]), { ticker, figi });
    }

    const only = candidates.values().next().value;
    if (candidates.size === 1 && only) {
      byCusip[cusip] = { ...only, matchedAt };
    } else {
      unresolvedCusips.push(cusip);
    }
  }
  return { byCusip, unresolvedCusips };
}
