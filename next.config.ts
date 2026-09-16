import { realpathSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

// 배포 함수 파일 목록에 심링크 디렉터리를 거친 경로가 있으면 Vercel은 패키징을 거부한다
// ("The framework produced an invalid deployment package for a Serverless Function").
// pnpm은 node_modules/pdfjs-dist를 .pnpm/pdfjs-dist@<버전>/… 심링크로 두므로, include에는 심링크를
// 거치지 않는 실제 파일 경로를 프로젝트 루트 기준 POSIX 상대 경로로 적는다. 버전 폴더는 하드코딩하지 않는다.
const projectDir = process.cwd();
const workerAlias = path.join(
  projectDir,
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
);
const pdfWorkerInclude = path
  .relative(projectDir, realpathSync(workerAlias))
  .split(path.sep)
  .join("/");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfjs-dist는 워커·표준 폰트 파일을 런타임 경로로 찾는다. 번들에 넣으면 파싱 시점에 실패한다.
  serverExternalPackages: ["pdfjs-dist"],
  // pdfjs는 Node에서 워커를 opaque dynamic import로 찾아 nft가 추적하지 못한다. 그 파일이 배포 함수에
  // 없으면 PDF 텍스트 추출이 런타임에 실패한다. 수집을 실행하는 두 라우트에만 워커 파일을 함께 넣는다.
  outputFileTracingIncludes: {
    "/api/sync/house": [pdfWorkerInclude],
    "/api/internal/sync/house": [pdfWorkerInclude],
  },
  // 개발 중 IP·도메인이 바뀌어도 HMR 접속을 허용한다. 점으로 구분된 호스트에 적용되며 프로덕션에는 적용되지 않는다.
  allowedDevOrigins: ["**.*"],
};

export default nextConfig;
