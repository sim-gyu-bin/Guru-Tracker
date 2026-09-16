import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfjs-dist는 워커·표준 폰트 파일을 런타임 경로로 찾는다. 번들에 넣으면 파싱 시점에 실패한다.
  serverExternalPackages: ["pdfjs-dist"],
  // pdfjs는 Node에서 워커를 opaque dynamic import로 찾아 nft가 추적하지 못한다. 그 파일이 배포 함수에
  // 없으면 PDF 텍스트 추출이 런타임에 실패한다. 수집을 실행하는 두 라우트에만 워커 파일을 함께 넣는다.
  outputFileTracingIncludes: {
    "/api/sync/house": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    "/api/internal/sync/house": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
  // 개발 중 IP·도메인이 바뀌어도 HMR 접속을 허용한다. 점으로 구분된 호스트에 적용되며 프로덕션에는 적용되지 않는다.
  allowedDevOrigins: ["**.*"],
};

export default nextConfig;
