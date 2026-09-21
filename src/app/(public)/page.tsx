import { redirect } from "next/navigation";

import { accessState } from "@/server/access";

// 루트는 공개 소개를 렌더하지 않고 요청마다 세션·승인 상태에 맞는 화면으로 이동한다.
export const dynamic = "force-dynamic";

/** 확인 실패는 승인으로 간주하지 않는다. 가입 요청 생성 없이 기존 접근 상태만 읽는다. */
export default async function RootPage() {
  const state = await accessState();
  if (state.kind === "member") {
    redirect(state.row.status === "approved" ? "/main" : "/pending");
  }
  redirect("/login");
}
