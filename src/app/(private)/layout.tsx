import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { sessionState } from "@/server/session";

/** 비공개 화면의 공통 인증 경계. 서버에서 검증된 Google 세션이 없으면 404로 종료한다. */
export default async function PrivateLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await sessionState();
  if (session.kind !== "identity") notFound();
  // 승인·관리자 권한은 데이터를 읽는 각 페이지와 서버 액션에서 별도로 검사한다.
  return children;
}
