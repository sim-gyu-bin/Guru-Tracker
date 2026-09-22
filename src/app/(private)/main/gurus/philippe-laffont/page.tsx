import { SecManagerDetail } from "@/components/sec-manager-detail";
import { isAdminRow } from "@/domain/access";
import { requireApprovedPage } from "@/server/access";
import { getSecView } from "@/server/sec-state";

export const dynamic = "force-dynamic";

/** Philippe Laffont의 승인된 요청에 저장 SEC 13F 캐시를 공통 상세로 전달한다. */
export default async function PhilippeLaffontPage() {
  const row = await requireApprovedPage();
  const view = await getSecView("laffont");

  return (
    <SecManagerDetail
      admin={isAdminRow(row)}
      config={{
        manager: "laffont",
        screen: "laffont",
        name: "Philippe Laffont",
        managerName: "COATUE MANAGEMENT LLC",
      }}
      view={view}
    />
  );
}
