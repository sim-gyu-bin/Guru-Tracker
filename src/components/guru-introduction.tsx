/**
 * 인물 이름 아래에 표시하는 한 줄 소개다.
 * 승인된 소개 문구만 받아 18px·leading-7 본문으로 표시한다. `--interactive`(라이트 #0066cc·다크 #0080ff)에서
 * `--primary`(라이트 #137a08·다크 #39ff14)로 가는 그라데이션을 글자에만 클립해, 모드별 승인 파랑→초록이 그대로 나온다.
 * 두 색 모두 옅은 배경에서 4.5:1 이상이지만 그라데이션 끝(초록)이 가장 낮으므로, 라이트 `--primary`를 더 밝히면 대비가 깨진다.
 * `w-fit`으로 상자 폭을 글자에 맞춰 그라데이션이 줄 끝 빈칸까지 늘어나지 않게 하고, `max-w-full`로 좁은 화면에서 줄바꿈을 허용한다.
 */
export function GuruIntroduction({ children }: { children: string }) {
  return (
    <p className="mb-0 w-fit max-w-full break-keep bg-linear-to-r from-interactive to-primary bg-clip-text text-lg leading-7 text-transparent">
      {children}
    </p>
  );
}
