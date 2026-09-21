import type { Metadata } from "next";
import Link from "next/link";

import { PolicySection, PublicPage } from "@/components/public-page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Guru Tracker | 서비스 소개",
  description: "가족과 지인을 위한 승인제 미국 투자 공시 조회 서비스입니다.",
};

/** 공개 홈페이지에는 서비스 설명과 진입 링크만 제공하며 공시·회원 데이터를 조회하지 않는다. */
export default function RootPage() {
  return (
    <PublicPage
      title="가족과 함께 살펴보는 투자 공시"
      description="Guru Tracker는 가족과 지인이 미국 공식 투자 공시를 편리하게 확인하는 비공개 조회 서비스입니다. 이 소개와 정책 문서만 누구나 볼 수 있습니다."
    >
      <PolicySection title="공식 원문을 기준으로 확인합니다">
        <p>
          SEC 13F, ARK 공식 보유 내역, 미국 하원 PTR을 바탕으로 투자자의 공개된
          보유·거래 정보를 살펴봅니다. 공시 기준일과 제출일은 실제 거래 시점과
          다를 수 있으며, 실시간 매매 정보가 아닙니다.
        </p>
        <p>
          공시에는 지연과 누락, 정정이 있을 수 있습니다. 원문을 함께 확인해야
          하며, 이 서비스는 투자 추천이나 수익 보장을 제공하지 않습니다.
        </p>
      </PolicySection>
      <PolicySection title="초대한 가족과 지인만 이용합니다">
        <p>
          Google 계정으로 로그인하면 관리자에게 이용 승인 요청이 접수됩니다.
          승인 전에는 조회 화면에 접근할 수 없으며 회원 정보와 관리자 화면은
          공개되지 않습니다.
        </p>
        <Button asChild>
          <Link href="/login">Google 로그인으로 시작하기</Link>
        </Button>
      </PolicySection>
      <PolicySection title="운영 및 문의">
        <p>
          개인이 운영하는 가족·지인용 서비스입니다. 이용 문의와 개인정보
          열람·정정·삭제 요청은 초대를 보낸 운영자에게 기존 연락 수단으로 전달해
          주세요.
        </p>
      </PolicySection>
    </PublicPage>
  );
}
