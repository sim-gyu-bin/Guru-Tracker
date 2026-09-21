import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { NavigationProvider } from "@/components/navigation-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

/*
 * 한국어 본문용 Pretendard Variable. 공식 저장소(orioncactus/pretendard)가 배포하는 가변 woff2를
 * 그대로 두고 next/font/local로만 싣는다. 출처·해시·라이선스는 src/app/fonts/PROVENANCE.txt에 있다.
 *
 * 한국어 글리프 1만 4천여 자를 담아 2MB이므로 preload는 켜지 않는다. 이 크기를 최우선 순위로 미리 받으면
 * 느린 회선에서 다른 자원이 밀린다. `display: "swap"`이라 첫 글자는 한국어 시스템 폰트로 즉시 그려지고,
 * 폰트가 도착하면 바뀐다.
 */
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 930",
  style: "normal",
  display: "swap",
  preload: false,
  // 한국어 대체 폰트는 Arial/Times 메트릭 조정 대상이 아니다. 켜면 줄 높이만 어긋난다.
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Guru Tracker",
  description: "공식 투자 공시를 한곳에서 확인하는 PWA 우선 추적 서비스",
  // Search Console 소유권 확인용 공개 값이며, 인증 유지에 필요하므로 배포 후에도 보존한다.
  verification: {
    google: "mVFeXUOs488kFyOqGqwzu8UY25ow2C4rb9hJX7U5UvQ",
  },
};

/*
 * 브라우저 도구 모음 색은 사용자가 고른 테마에 따라 달라진다. 서버는 그 선택을 알 수 없으므로 시스템 질의에 묶인
 * 색을 미리 내보내지 않는다. 대신 라이트 기본색 하나를 내보내고, 다크를 고른 경우에는 첫 페인트 전 사전
 * 스크립트가 이 meta의 content를 다시 쓴다. 두 색은 theme-provider.tsx의 `THEME_COLORS`와 같아야 한다.
 * `colorScheme`의 두 값은 라이트·다크를 모두 쓸 수 있다는 선언이며, 실제 적용값은 `<html>`의 인라인 스타일이 정한다.
 */
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#f2f4f8",
  width: "device-width",
  initialScale: 1,
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

/**
 * 모든 화면에 한국어 문서 언어와 공통 시각 기반을 제공하는 루트 레이아웃이다.
 * 이동 중 표시 상태는 이 경계의 NavigationProvider 한 곳에서만 관리하며, 페이지는 서버 컴포넌트로 유지한다.
 *
 * 색상 모드 클래스(`dark`)와 color-scheme은 ThemeProvider가 첫 페인트 전에 `<html>`에 직접 붙인다. 서버는 그
 * 값을 알 수 없어 `<html>`의 class·style이 수화 시점과 어긋나므로 `suppressHydrationWarning`을 둔다. 이 억제는
 * 해당 요소의 속성 차이에만 적용되고 하위 트리에는 번지지 않는다.
 *
 * 폰트 변수 클래스는 `<html>`에 둔다. globals.css의 `--font-sans`가 `:root`에서 `var(--font-pretendard)`를
 * 풀어야 하므로, body에 두면 본문 폰트 지정이 통째로 무효가 된다.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <body>
        {/* 테마 사전 스크립트가 body 첫 자식으로 나가므로, 모든 화면이 같은 선택을 보도록 가장 바깥에 둔다. */}
        <ThemeProvider>
          <NavigationProvider>{children}</NavigationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
