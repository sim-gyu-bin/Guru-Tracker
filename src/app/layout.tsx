import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Guru Tracker",
  description: "공식 투자 공시를 한곳에서 확인하는 PWA 우선 추적 서비스",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f4f5ef",
  width: "device-width",
  initialScale: 1,
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

/**
 * 모든 화면에 한국어 문서 언어와 공통 시각 기반을 제공하는 루트 레이아웃이다.
 * PWA 메타데이터와 공급자는 실제 기능을 구현하는 단계에서 이 경계에 추가한다.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
