import "server-only";
import { createHash } from "node:crypto";
import { type ArkFund, type ArkSnapshot, isArkFund } from "../../../domain/ark";
import { parseArkHoldingsCsv } from "./parse";

/** 검증된 펀드 보유와 실제 CSV 원문이다. DB 버전·회전은 수집기가 아니라 lease를 가진 조정자가 결정한다. */
export interface ArkCollection {
  snapshot: Omit<ArkSnapshot, "version">;
  documentHash: string;
  normalizedHash: string;
  originals: { name: string; text: string; contentType: string }[];
}

const easternDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

async function officialText(
  url: string,
  deadline: AbortSignal,
  limit: number,
): Promise<string> {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    !["www.ark-funds.com", "assets.ark-funds.com"].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.port ||
    target.hash
  )
    throw new Error("ARK_VALIDATION");
  const response = await fetch(target, {
    cache: "no-store",
    redirect: "error",
    // 기본 Node 식별자는 공식 호스트에서 거부될 수 있어 실제 앱 이름을 명시한다.
    headers: {
      "User-Agent": "GuruTracker/1.0",
      Accept: "text/csv,text/html;q=0.9,*/*;q=0.5",
    },
    signal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)]),
  });
  if (!response.ok || !response.body) throw new Error("ARK_ACCESS");
  const declaredSize = response.headers.get("content-length");
  if (declaredSize && Number(declaredSize) > limit) {
    await response.body.cancel();
    throw new Error("ARK_VALIDATION");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > limit) throw new Error("ARK_VALIDATION");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof TypeError) throw new Error("ARK_VALIDATION");
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!text.trim()) throw new Error("ARK_VALIDATION");
  return text;
}

// 2026-09-15 각 공식 펀드 페이지의 Full Holdings CSV 링크로 검증한 원문 이름이다.
// 펀드의 표시 이름으로 경로를 추측하지 않는다. 공식 주소가 바뀌면 실패 상태로 남기고 재검증한다.
const CSV_FILES: Record<ArkFund, string> = {
  ARKK: "ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv",
  ARKQ: "ARK_AUTONOMOUS_TECH._&_ROBOTICS_ETF_ARKQ_HOLDINGS.csv",
  ARKW: "ARK_NEXT_GENERATION_INTERNET_ETF_ARKW_HOLDINGS.csv",
  ARKG: "ARK_GENOMIC_REVOLUTION_ETF_ARKG_HOLDINGS.csv",
  ARKF: "ARK_BLOCKCHAIN_&_FINTECH_INNOVATION_ETF_ARKF_HOLDINGS.csv",
  ARKX: "ARK_SPACE_&_DEFENSE_INNOVATION_ETF_ARKX_HOLDINGS.csv",
};

/**
 * 공식 페이지에서 검증한 공개 다운로드 주소의 전체 CSV를 읽고 펀드·기준일·내용을 검증한다.
 * 일부 웹페이지의 봇 확인 HTML에 의존하지 않으며 로그인·챌린지를 우회하지 않는다.
 * 이름 추측·제3자 자료·매매 추론은 하지 않으며, 네트워크/형식 오류는 기존 캐시를 보존하도록 상위로 전달한다.
 */
export async function collectArkFund(
  fund: ArkFund,
  signal: AbortSignal,
): Promise<ArkCollection> {
  if (!isArkFund(fund)) throw new Error("ARK_VALIDATION");
  const sourceUrl = `https://www.ark-funds.com/funds/${fund.toLowerCase()}`;
  const holdingsUrl = new URL(
    `https://assets.ark-funds.com/fund-documents/funds-etf-csv/${CSV_FILES[fund]}`,
  );
  const csv = await officialText(holdingsUrl.href, signal, 2_000_000);
  const parsed = parseArkHoldingsCsv(csv, fund);
  // 원문 날짜는 미국 시장의 날짜다. UTC/KST 날짜로 바꾸지 않으며 미래 기준일은 반영하지 않는다.
  if (parsed.reportDate > easternDate.format(new Date()))
    throw new Error("ARK_VALIDATION");
  const canonicalHoldings = [...parsed.holdings].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  return {
    snapshot: { fund, sourceUrl, holdingsUrl: holdingsUrl.href, ...parsed },
    documentHash: createHash("sha256").update(csv).digest("hex"),
    // 게시 날짜·정렬·고지 문구만 바뀌면 실제 보유 변경 이벤트를 만들지 않는다.
    normalizedHash: createHash("sha256")
      .update(JSON.stringify({ fund, holdings: canonicalHoldings }))
      .digest("hex"),
    originals: [{ name: "holdings.csv", text: csv, contentType: "text/csv" }],
  };
}
