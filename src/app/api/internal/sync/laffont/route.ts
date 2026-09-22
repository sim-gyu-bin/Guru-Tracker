import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncSec } from "@/server/sec-state";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Philippe Laffont SEC 13F 운영자·Supabase Cron용 진입점이다. 서버 비밀값이 없으면 닫고, 화면 접근 갱신과 같은 멱등 조정자를 호출한다. */
export async function POST(request: Request) {
  const secret = process.env.SYNC_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json(
      { status: "failed", message: "내부 동기화 인증이 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json(
      { status: "failed", message: "동기화 호출 권한이 없습니다." },
      { status: 401 },
    );
  }
  const result = await syncSec("laffont");
  return NextResponse.json(result, {
    status: result.status === "failed" ? 503 : 200,
  });
}
