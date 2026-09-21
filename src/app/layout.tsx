import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { NavigationProvider } from "@/components/navigation-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guru Tracker",
  description: "공식 투자 공시를 한곳에서 확인하는 PWA 우선 추적 서비스",
  // Search Console 소유권 확인용 공개 값이며, 인증 유지에 필요하므로 배포 후에도 보존한다.
  verification: {
    google: "mVFeXUOs488kFyOqGqwzu8UY25ow2C4rb9hJX7U5UvQ",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f7f8",
  width: "device-width",
  initialScale: 1,
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

/**
 * 모든 화면에 한국어 문서 언어와 공통 시각 기반을 제공하는 루트 레이아웃이다.
 * 이동 중 표시 상태는 이 경계의 NavigationProvider 한 곳에서만 관리하며, 페이지는 서버 컴포넌트로 유지한다.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko">
      <body>
        <NavigationProvider>{children}</NavigationProvider>
      </body>
    </html>
  );
}
