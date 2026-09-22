import { SecManagerDetail } from "@/components/sec-manager-detail";
import { isAdminRow } from "@/domain/access";
import { requireApprovedPage } from "@/server/access";
import { getSecView } from "@/server/sec-state";

export const dynamic = "force-dynamic";

/** Brad Gerstner의 승인된 요청에 저장 SEC 13F 캐시를 공통 상세로 전달한다. */
export default async function BradGerstnerPage() {
  const row = await requireApprovedPage();
  const view = await getSecView("gerstner");

  return (
    <SecManagerDetail
      admin={isAdminRow(row)}
      config={{
        manager: "gerstner",
        screen: "gerstner",
        name: "Brad Gerstner",
        introduction: "알티미터를 이끌며 인터넷·소프트웨어 기업에 집중 투자",
        managerName: "Altimeter Capital Management, LP",
      }}
      view={view}
    />
  );
}
