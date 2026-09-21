import "server-only";

import { escapeHtml } from "../domain/access";
import { adminEmail, appOrigin } from "./config";

/**
 * 관리자 알림 메일. Resend HTTP API만 쓰고 메일 라이브러리는 추가하지 않는다.
 *
 * 알림은 보조 수단이다. 전송에 실패해도 가입 요청 행은 DB에 그대로 남고 관리자 화면에 보이며,
 * 이 모듈은 어떤 경우에도 예외를 던지지 않는다. 사용자 이메일은 로그에 남기지 않는다.
 */
export type AccessMailOutcome = "sent" | "unconfigured" | "failed";

export async function sendAccessRequestMail(request: {
  userId: string;
  email: string;
  revision: number;
  requestedAt: string;
}): Promise<AccessMailOutcome> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  const to = adminEmail();
  const origin = appOrigin();
  if (!apiKey || !from || !to || !origin) return "unconfigured";

  // 메일 링크는 관리자 화면의 특정 요청과 의도만 가리키고 결정을 실행하지 않는다.
  const link = (intent: "approve" | "reject") =>
    `${origin}/admin?request=${encodeURIComponent(request.userId)}&intent=${intent}&revision=${request.revision}`;
  const requestedAt = new Date(request.requestedAt);
  const requestedLabel = Number.isNaN(requestedAt.getTime())
    ? "확인 불가"
    : requestedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const email = escapeHtml(request.email);

  const text = [
    "Guru Tracker 가입 요청이 접수되었습니다.",
    `요청 계정: ${request.email}`,
    `요청 시각: ${requestedLabel} (KST)`,
    "",
    `승인 화면: ${link("approve")}`,
    `거절 화면: ${link("reject")}`,
    "",
    "링크는 관리자 화면을 여는 용도입니다. 로그인한 관리자가 화면에서 확인해야 결정이 반영됩니다.",
  ].join("\n");

  const html = [
    "<p>Guru Tracker 가입 요청이 접수되었습니다.</p>",
    `<p>요청 계정: <strong>${email}</strong><br />요청 시각: ${requestedLabel} (KST)</p>`,
    `<p><a href="${link("approve")}">승인 화면 열기</a> · <a href="${link("reject")}">거절 화면 열기</a></p>`,
    "<p>링크는 관리자 화면을 여는 용도입니다. 로그인한 관리자가 화면에서 확인해야 결정이 반영됩니다.</p>",
  ].join("");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Guru Tracker 가입 승인 요청",
        text,
        html,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      // 상태 코드만 남긴다. 요청 본문(사용자 이메일 포함)은 로그로 보내지 않는다.
      console.error("ACCESS_MAIL_FAILED", response.status);
      return "failed";
    }
    return "sent";
  } catch {
    console.error("ACCESS_MAIL_FAILED", "network");
    return "failed";
  }
}
