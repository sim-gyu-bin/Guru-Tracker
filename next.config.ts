import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 개발 중 IP·도메인이 바뀌어도 HMR 접속을 허용한다. 점으로 구분된 호스트에 적용되며 프로덕션에는 적용되지 않는다.
  allowedDevOrigins: ["**.*"],
};

export default nextConfig;
