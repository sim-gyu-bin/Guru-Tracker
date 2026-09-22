import { SecManagerDetail } from "@/components/sec-manager-detail";
import { isAdminRow } from "@/domain/access";
import { requireApprovedPage } from "@/server/access";
import { getSecView } from "@/server/sec-state";

export const dynamic = "force-dynamic";

/** David Tepper의 승인된 요청에 저장 SEC 13F 캐시를 공통 상세로 전달한다. */
export default async function DavidTepperPage() {
  const row = await requireApprovedPage();
  const view = await getSecView("tepper");

  return (
    <SecManagerDetail
      admin={isAdminRow(row)}
      config={{
        manager: "tepper",
        screen: "tepper",
        name: "David Tepper",
        managerName: "Appaloosa LP",
      }}
      view={view}
    />
  );
}
