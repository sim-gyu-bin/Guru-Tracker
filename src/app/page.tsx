const trackedGurus = [
  "Stanley Druckenmiller",
  "Cathie Wood",
  "Nancy Pelosi",
  "Michael Burry",
  "Philippe Laffont",
  "Brad Gerstner",
  "David Tepper",
] as const;

const sourceCards = [
  {
    eyebrow: "분기 공시",
    title: "SEC 13F",
    description: "기관 보유 현황을 공식 제출 문서 기준으로 확인합니다.",
  },
  {
    eyebrow: "일별 자료",
    title: "ARK Invest",
    description: "공식 holdings와 trades 자료만 사용합니다.",
  },
  {
    eyebrow: "거래 공개",
    title: "미국 하원 PTR",
    description: "의원 거래는 하원 공식 공개 문서를 기준으로 확인합니다.",
  },
] as const;

/**
 * 구현 전 제품 범위와 공식 출처를 명확히 보여 주는 초기 홈 화면이다.
 * 실제 데이터가 연결되기 전까지 수집 완료나 최신 상태로 오인할 표현을 노출하지 않는다.
 */
export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-ink/10 bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <a className="font-semibold tracking-tight" href="#top">
            Guru Tracker
          </a>
          <span className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-medium text-ink/65">
            초기 구성 중
          </span>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <p className="mb-5 text-sm font-semibold text-accent">
              공식 공시 기반 투자 정보
            </p>
            <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-6xl">
              흩어진 투자 공시를
              <br />한 흐름으로 살펴보세요
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-ink/65 sm:text-lg sm:leading-8">
              일곱 명의 공개 보유·거래 정보를 공식 원문과 함께 읽기 쉽게 정리할
              예정입니다. 현재는 애플리케이션 기반을 구성하고 있습니다.
            </p>
          </div>

          <aside className="rounded-3xl border border-ink/10 bg-ink p-6 text-canvas shadow-soft sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-canvas/55">
              다음 구현 단계
            </p>
            <p className="mt-4 text-xl font-medium leading-8">
              Supabase 데이터 계약과 첫 SEC 13F 수집 경로를 연결합니다.
            </p>
            <p className="mt-5 text-sm leading-6 text-canvas/60">
              검증된 실제 데이터가 준비되기 전에는 임시 수치나 모의 공시를
              표시하지 않습니다.
            </p>
          </aside>
        </section>

        <section className="border-y border-ink/10 bg-white/65">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-accent">추적 범위</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  일곱 명의 공개 정보
                </h2>
              </div>
              <span className="text-sm text-ink/45">7명</span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {trackedGurus.map((guru, index) => (
                <li
                  className="flex min-h-16 items-center gap-4 rounded-2xl border border-ink/10 bg-canvas px-5"
                  key={guru}
                >
                  <span className="text-xs tabular-nums text-ink/35">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-medium">{guru}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-sm font-semibold text-accent">공식 출처</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            출처가 확인된 자료만 사용합니다
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {sourceCards.map((source) => (
              <article
                className="rounded-3xl border border-ink/10 bg-white p-6 sm:p-7"
                key={source.title}
              >
                <p className="text-xs font-semibold text-accent">
                  {source.eyebrow}
                </p>
                <h3 className="mt-4 text-xl font-semibold">{source.title}</h3>
                <p className="mt-3 text-sm leading-6 text-ink/60">
                  {source.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-ink/10">
        <div className="mx-auto max-w-6xl px-5 py-8 text-xs leading-5 text-ink/50 sm:px-8">
          Guru Tracker는 투자 조언이나 수익을 보장하지 않습니다. 투자 판단 전
          공식 원문을 별도로 확인하세요.
        </div>
      </footer>
    </div>
  );
}
