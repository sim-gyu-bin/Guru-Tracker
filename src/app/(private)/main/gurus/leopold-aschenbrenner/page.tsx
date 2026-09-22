import { SecManagerDetail } from "@/components/sec-manager-detail";
import { isAdminRow } from "@/domain/access";
import { requireApprovedPage } from "@/server/access";
import { getSecView } from "@/server/sec-state";

export const dynamic = "force-dynamic";

/** Leopold Aschenbrenner의 승인된 요청에 저장 SEC 13F 캐시를 공통 상세로 전달한다. */
export default async function LeopoldAschenbrennerPage() {
  const row = await requireApprovedPage();
  const view = await getSecView("aschenbrenner");

  return (
    <SecManagerDetail
      admin={isAdminRow(row)}
      config={{
        manager: "aschenbrenner",
        screen: "aschenbrenner",
        name: "Leopold Aschenbrenner",
        introduction:
          "AI 발전에 따른 산업 변화를 투자 주제로 삼는 시추에이셔널 어웨어니스 창업자",
        managerName: "Situational Awareness LP",
      }}
      view={view}
    />
  );
}
