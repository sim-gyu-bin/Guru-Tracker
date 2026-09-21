import "server-only";

/**
 * 서버 전용 환경 변수를 해석한다.
 *
 * 관리자 초기 이메일 실제 주소는 저장소·로그·문서·대화에 남기지 않고 운영자가 서버 환경 변수에만
 * 넣는다. 이 모듈은 값을 그대로 돌려줄 뿐 어디에도 출력하지 않는다.
 */

/**
 * 배포 기준 오리진. 메일 링크와 명시된 OAuth 복귀 주소에 사용한다.
 *
 * 값은 오리진만 허용한다. 경로·쿼리·프래그먼트·사용자 정보가 붙었거나 localhost가 아닌데 https가
 * 아니면 오리진 설정 실수로 보고 없는 것으로 처리한다(조용히 잘라내지 않는다).
 * 리디렉션 주소의 최종 방어선은 Supabase 허용 목록이다.
 */
export function appOrigin(): string | null {
  const value = process.env.APP_URL?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const local =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (
      parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && local)
    ) {
      return null;
    }
    if (parsed.username || parsed.password) return null;
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * 관리자 초기 검증 이메일. 형식이 어긋나면 없는 것으로 본다.
 * 관리자 승격은 이 값과 확인된 Google identity가 모두 맞을 때만 DB에서 이뤄진다.
 */
export function adminEmail(): string | null {
  const value = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

/**
 * OAuth 복귀 주소를 만든다. 명시된 APP_URL은 개발 중에도 우선하며 잘못된 값은 거절한다.
 * 미설정 시 개발 모드의 루프백 요청만 포트를 포함해 허용한다. 운영·메일에는 이 대체 경로를
 * 사용하지 않는다. 전달 헤더가 아닌 라우트의 요청 URL을 사용하며 Supabase 허용 목록도 필요하다.
 */
export function callbackUrl(path: string, requestUrl: string): string | null {
  if (process.env.APP_URL?.trim()) {
    const configured = appOrigin();
    return configured ? `${configured}${path}` : null;
  }
  if (process.env.NODE_ENV !== "development") return null;
  try {
    const request = new URL(requestUrl);
    if (
      (request.hostname !== "localhost" && request.hostname !== "127.0.0.1") ||
      (request.protocol !== "http:" && request.protocol !== "https:") ||
      request.username ||
      request.password
    ) {
      return null;
    }
    return `${request.origin}${path}`;
  } catch {
    return null;
  }
}
