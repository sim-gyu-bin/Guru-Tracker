import "server-only";
import { unstable_cache } from "next/cache";
import { parseOpenFigiResponse } from "../domain/openfigi";
import type { SecHolding } from "../domain/sec";
import type { TickerLookup } from "../domain/ticker";

type BatchResult = Pick<TickerLookup, "byCusip" | "unresolvedCusips">;
const inFlight = new Map<string, Promise<BatchResult>>();

function isCusip(value: string): boolean {
  if (!/^[A-Z0-9][A-Z0-9*@#]{7}[0-9]$/.test(value)) return false;
  // CUSIP·CINS의 마지막 숫자는 앞 8자리의 교대 가중치 체크섬이다. 원문을 보정하지 않는다.
  let sum = 0;
  for (let index = 0; index < 8; index += 1) {
    const character = value[index];
    const code = character.charCodeAt(0);
    const digit =
      code >= 48 && code <= 57
        ? code - 48
        : code >= 65 && code <= 90
          ? code - 55
          : character === "*"
            ? 36
            : character === "@"
              ? 37
              : 38;
    const weighted = digit * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(weighted / 10) + (weighted % 10);
  }
  return (10 - (sum % 10)) % 10 === Number(value[8]);
}

// 성공한 검증 결과만 24시간 저장한다. throw를 그대로 전달해야 Next가 재검증 실패 시
// 기존 정상 캐시를 유지하며, 최초 실패를 정상 no-match로 저장하지 않는다.
const getCachedBatch = unstable_cache(
  async (cusips: string[]): Promise<BatchResult> => {
    const key = JSON.stringify(cusips);
    const existing = inFlight.get(key);
    if (existing) return existing;
    const request = (async () => {
      const response = await fetch("https://api.openfigi.com/v3/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          cusips.map((cusip) => ({
            // CGS의 CINS는 첫 영문자가 국가·지역 코드다. exact 식별자 타입만 구분한다.
            idType: /^[A-Z]/.test(cusip) ? "ID_CINS" : "ID_CUSIP",
            idValue: cusip,
            exchCode: "US",
            marketSecDes: "Equity",
            // 폐기·비상장 티커를 현재 미국 상장 티커로 표시하지 않는다.
            includeUnlistedEquities: false,
          })),
        ),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("OPENFIGI_REQUEST_FAILED");
      const payload: unknown = await response.json();
      return parseOpenFigiResponse(cusips, payload, new Date().toISOString());
    })();
    inFlight.set(key, request);
    try {
      return await request;
    } finally {
      // 영구 메모리 캐시를 만들지 않고 처리 중인 동일 배치만 공유한다.
      inFlight.delete(key);
    }
  },
  ["openfigi-v3-us-equity-cusip-cins-v1"],
  { revalidate: 24 * 60 * 60 },
);

/**
 * SH 보유의 exact CUSIP·CINS에 현재 미국 참조 티커를 붙인다. 13F 원본은 변경하지 않는다.
 * 옵션 PUT/CALL은 기초자산 식별자이며 PRN은 요청하지 않는다. 이름 추측도 하지 않는다.
 * 잘못된 CUSIP·정상 no-match·모호성은 unresolved, 배치 조회 실패는 unavailable이다.
 * 실패는 캐시 함수 밖에서 격리하여 다른 배치의 성공 결과와 기존 정상 캐시를 보존한다.
 */
export async function getHoldingTickers(
  holdings: SecHolding[],
): Promise<TickerLookup> {
  const result: TickerLookup = {
    byCusip: {},
    unresolvedCusips: [],
    unavailableCusips: [],
  };
  const cusips = [
    ...new Set(
      holdings
        .filter((holding) => holding.shareType === "SH")
        .map((holding) => holding.cusip),
    ),
  ].sort();
  const validCusips: string[] = [];
  for (const cusip of cusips) {
    if (isCusip(cusip)) validCusips.push(cusip);
    else result.unresolvedCusips.push(cusip);
  }
  // 무인증 API는 최대 10 jobs/request다. 병렬 배치·자동 재시도로 제한을 증폭하지 않는다.
  for (let index = 0; index < validCusips.length; index += 10) {
    const batch = validCusips.slice(index, index + 10);
    try {
      const resolved = await getCachedBatch(batch);
      Object.assign(result.byCusip, resolved.byCusip);
      result.unresolvedCusips.push(...resolved.unresolvedCusips);
    } catch {
      result.unavailableCusips.push(...batch);
    }
  }
  result.unresolvedCusips.sort();
  return result;
}
