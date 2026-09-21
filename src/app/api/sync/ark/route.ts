import { NextResponse } from "next/server";
import { isArkFund } from "@/domain/ark";
import { approvedApi } from "@/server/access";
import { getArkView, syncArk } from "@/server/ark";
import { isSameOriginRequest } from "@/server/origin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 같은 출처 화면의 오래된 캐시만 보완한다. 임의 펀드·원문 URL을 받지 않으며 DB lease는 내부 경로와 공유한다. */
export async function POST(request: Request) {
  // 다른 동기화 경로와 같은 순서로 판정한다. 같은 출처 확인 → 승인 확인 → 입력 확인이며,
  // 세션 없는 요청은 보낸 펀드 값과 무관하게 401로 끝난다.
  if (!isSameOriginRequest(request.headers)) {
    return NextResponse.json(
      { status: "failed", message: "같은 사이트에서만 갱신할 수 있습니다." },
      { status: 403 },
    );
  }
  // 승인되지 않은 요청은 캐시 읽기 전에 끝낸다. 내부 Cron은 이 경로가 아니라 bearer 경로를 쓴다.
  const access = await approvedApi();
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const requested = url.searchParams.get("fund");
  if (!isArkFund(requested)) {
    return NextResponse.json(
      { status: "failed", message: "지원하지 않는 펀드입니다." },
      { status: 400 },
    );
  }

  const view = await getArkView(requested);
  if (view.status === "unconfigured") {
    return NextResponse.json(
      {
        status: "failed",
        message: view.lastError ?? "서버 데이터 연결을 확인해 주세요.",
      },
      { status: 503 },
    );
  }
  if (!view.stale && view.snapshot) {
    return NextResponse.json({ status: "fresh" });
  }
  const result = await syncArk(requested);
  return NextResponse.json(result, {
    status: result.status === "failed" ? 503 : 200,
  });
}
