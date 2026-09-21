import type { ReactNode } from "react";

import { GuruLink } from "@/components/guru-link";
import { Button } from "@/components/ui/button";

/** 로그인·승인 정보 없이 공개 문서를 렌더하는 프레임이다. 머리말에는 로그인 진입만 두고 바닥글에 정책 링크를 모은다. */
export function PublicPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <nav
          aria-label="공개 페이지 탐색"
          className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4"
        >
          <GuruLink
            href="/"
            className="rounded-sm text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring"
          >
            Guru Tracker
          </GuruLink>
          <Button asChild variant="outline" size="sm">
            <GuruLink href="/login">로그인</GuruLink>
          </Button>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <div className="mt-8 space-y-8">{children}</div>
      </main>
      <footer className="mx-auto max-w-3xl border-t border-border px-5 py-5">
        <nav
          aria-label="서비스 정책 및 로그인"
          className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"
        >
          <GuruLink
            href="/login"
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            로그인
          </GuruLink>
          <GuruLink
            href="/privacy"
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            개인정보처리방침
          </GuruLink>
          <GuruLink
            href="/terms"
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            이용약관
          </GuruLink>
        </nav>
      </footer>
    </div>
  );
}

/** 정책 문서의 제목 위계와 본문 간격을 공개 페이지 사이에서 일관되게 유지한다. */
export function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
