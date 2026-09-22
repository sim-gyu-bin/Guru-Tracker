import { GuruIntroduction } from "@/components/guru-introduction";
import { Badge } from "@/components/ui/badge";

type GuruDetailHeaderProps = Readonly<{
  /** 제목 위에 표시하는 출처 라벨이다. 저장된 공식 공시를 가리키며 실시간·검증 보증을 뜻하지 않는다. */
  source: string;
  /** 인물 이름이다. 제목 전체를 강조 없는 `--foreground` 한 색으로 그린다. */
  name: string;
  /** 인물 한 줄 소개다. GuruIntroduction과 같은 18px·leading-7 본문이며 파랑→초록 그라데이션 강조는 소개가 맡는다. */
  introduction: string;
}>;

/**
 * 추적 대상 상세 머리말이다. 출처 배지 → 30px 이름 → 18px 소개 순서를 한곳에 고정해
 * SEC 공통 상세와 Burry·Cathie Wood·Pelosi 화면이 같은 시각 위계를 쓰게 한다.
 * 캐시 상태 배지와 14px 공시 안내는 호출부가 소유하며, 이 컴포넌트는 데이터 상태를 읽지 않으므로 빈 상태·오류에도 같은 머리말이 남는다.
 *
 * 색과 레이아웃 근거:
 * - 이름은 `--foreground` 한 색으로만 그린다. 라이트 네이비·다크 화이트가 그대로 나오므로 제목 전용 토큰이 필요 없다.
 * - 파랑→초록 강조는 소개 문장이 맡는다. 제목과 소개가 같은 그라데이션을 쓰면 두 줄이 한 덩어리로 붙어 보인다.
 * - 출처 배지의 옅은 초록은 나머지 상태 배지와 같은 토큰·투명도를 유지해, 준비 상태 배지의 네온 강조와 구분된다.
 * - 출처 점은 장식이라 `aria-hidden`으로 읽기 순서에서 빼고, 애니메이션 없이 정적으로만 둔다.
 */
export function GuruDetailHeader({
  source,
  name,
  introduction,
}: GuruDetailHeaderProps) {
  return (
    <>
      <Badge
        className="mb-2 h-auto gap-1.5 rounded-full border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary dark:bg-primary/10"
        variant="outline"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
        {source}
      </Badge>
      <h1 className="mb-2.5 text-3xl leading-9 font-semibold tracking-tight text-foreground">
        {name}
      </h1>
      <GuruIntroduction>{introduction}</GuruIntroduction>
    </>
  );
}
