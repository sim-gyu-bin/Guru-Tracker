import { NextResponse } from "next/server";
import { getHousePtrView, syncHousePtr } from "@/server/house";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 같은 출처 화면의 오래된 캐시만 보완한다. 임의 문서·원문 URL을 받지 않으며 DB lease는 내부 경로와 공유한다.
 * 최신 PTR 1건만 대상이라 추가 입력이 없다.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin !== url.origin) {
    return NextResponse.json(
      { status: "failed", message: "같은 사이트에서만 갱신할 수 있습니다." },
      { status: 403 },
    );
  }

  const view = await getHousePtrView();
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
  const result = await syncHousePtr();
  return NextResponse.json(result, {
    status: result.status === "failed" ? 503 : 200,
  });
}
