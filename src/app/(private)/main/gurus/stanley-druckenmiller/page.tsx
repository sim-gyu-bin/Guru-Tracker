import { SecManagerDetail } from "@/components/sec-manager-detail";
import { isAdminRow } from "@/domain/access";
import { requireApprovedPage } from "@/server/access";
import { getSecView } from "@/server/sec-state";

// 요청마다 저장된 공시와 동기화 상태를 읽으며 수집은 화면의 별도 보완 경로로 실행한다.
export const dynamic = "force-dynamic";

/** Stanley 화면은 공통 SEC 13F 상세에 대상 설정과 승인 결과만 전달한다. */
export default async function StanleyDruckenmillerPage() {
  const row = await requireApprovedPage();
  const view = await getSecView("stanley");

  return (
    <SecManagerDetail
      admin={isAdminRow(row)}
      config={{
        manager: "stanley",
        screen: "stanley",
        name: "Stanley Druckenmiller",
        introduction:
          "거시경제 흐름을 바탕으로 투자하는 전설적인 매크로 투자자",
        managerName: "Duquesne Family Office LLC",
      }}
      view={view}
    />
  );
}
