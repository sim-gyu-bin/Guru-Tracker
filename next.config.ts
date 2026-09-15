import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfjs-dist는 워커·표준 폰트 파일을 런타임 경로로 찾는다. 번들에 넣으면 파싱 시점에 실패한다.
  serverExternalPackages: ["pdfjs-dist"],
  // 개발 중 IP·도메인이 바뀌어도 HMR 접속을 허용한다. 점으로 구분된 호스트에 적용되며 프로덕션에는 적용되지 않는다.
  allowedDevOrigins: ["**.*"],
};

export default nextConfig;
