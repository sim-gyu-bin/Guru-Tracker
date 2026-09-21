"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/** 사용자가 고를 수 있는 테마 값이다. 이 세 값만 저장소에 기록한다. */
export type ThemeChoice = "light" | "dark" | "system";

/** 실제로 화면에 적용된 색상 모드다. "system" 선택은 판정한 운영체제 값으로 해석된다. */
export type ResolvedTheme = "light" | "dark";

/**
 * 저장 키는 아래 사전 스크립트 문자열에도 그대로 들어간다. 값을 바꾸면 기존 사용자의 선택이 초기화된다.
 * `guru-tracker:<영역>:<용도>` 형식으로 같은 출처의 다른 키와 구분한다.
 */
const THEME_STORAGE_KEY = "guru-tracker:theme:choice";

// 운영체제 색상 모드를 판정하는 질의다. 이 문자열은 사전 스크립트와 공유한다.
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** 저장소에서 읽은 값이 허용된 선택지인지 좁힌다. 모르는 값은 선택 없음으로 본다. */
function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/** 선택값을 적용할 색상 모드로 해석한다. "system"만 실행 시점의 운영체제 값을 따른다. */
function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") {
    return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
  }
  return choice;
}

/*
 * 브라우저 도구 모음(theme-color)에 쓸 색이다. layout.tsx의 `viewport.themeColor`가 라이트 값을 이미 내보내므로
 * 서버 HTML은 기본 상태에서 옳다. 다크를 직접 고른 경우에는 그 값이 어긋나므로, 첫 페인트 전 사전 스크립트와
 * 선택 변경 시점에 여기 값으로 덮어쓴다. layout.tsx의 라이트 색과 이 상수는 서로 같아야 한다.
 */
const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#f2f4f8",
  dark: "#0a0e27",
};

/**
 * `<html>`의 클래스와 color-scheme, 도구 모음 색을 한 번에 맞춘다.
 * 클래스는 토큰과 `dark:` 유틸리티를, color-scheme은 스크롤바·폼 컨트롤 같은 브라우저 기본 요소의 색을 정하므로
 * 값을 항상 같이 맞춘다. 어긋나면 도구 모음이나 기본 컨트롤만 밝게 남는다.
 */
function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[resolved]);
}

/** 저장된 선택을 읽는다. 저장소가 막혀도 예외를 밖으로 내보내지 않고 "system"으로 동작한다. */
function readStoredChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    // 사생활 보호 설정·저장소 차단: 선택을 기억하지 못할 뿐 현재 화면은 정상 동작한다.
    return "system";
  }
}

/** 선택을 저장한다. 저장이 거절되어도 지금 탭의 표시 상태는 그대로 유지된다. */
function persistChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // 저장 거절은 무시한다. 이번 방문 동안에는 메모리 상태로 동작한다.
  }
}

/*
 * 첫 페인트 전에 실행되는 사전 스크립트다. 서버가 보내는 HTML은 색상 모드를 모르므로, 여기서 먼저 확정하지 않으면
 * 라이트 화면이 한 프레임 보였다가 어두워지는 깜빡임이 생긴다. 저장소 읽기가 막혀도 운영체제 설정은 그대로 따르도록
 * 읽기 실패와 판정을 분리했다. 도구 모음 색도 같은 시점에 덮어써야 어두운 화면에 밝은 띠가 남지 않는다.
 * 보간하는 값은 위 두 상수뿐이고 사용자 입력은 들어가지 않는다.
 */
const themeInitScript = `(function(){var choice="system";try{var stored=window.localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(stored==="light"||stored==="dark"||stored==="system"){choice=stored;}}catch(error){}var dark=choice==="dark";if(choice==="system"){try{dark=window.matchMedia(${JSON.stringify(
  DARK_MEDIA_QUERY,
)}).matches;}catch(error){dark=false;}}var root=document.documentElement;if(dark){root.classList.add("dark");}else{root.classList.remove("dark");}root.style.colorScheme=dark?"dark":"light";var meta=document.querySelector('meta[name="theme-color"]');if(meta){meta.setAttribute("content",dark?${JSON.stringify(
  THEME_COLORS.dark,
)}:${JSON.stringify(THEME_COLORS.light)});}})();`;

type ThemeContextValue = Readonly<{
  /** 저장된 선택값이다. "system"이면 운영체제 설정을 따른다. */
  choice: ThemeChoice;
  /** 지금 화면에 적용된 색상 모드다. */
  resolved: ResolvedTheme;
  /** 선택을 바꾸고 즉시 적용·저장한다. */
  setTheme: (choice: ThemeChoice) => void;
}>;

const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = Readonly<{
  children: ReactNode;
}>;

/**
 * 색상 모드 선택을 한 곳에서 관리하고 `<html>`에 반영하는 클라이언트 경계다.
 *
 * 서버 렌더 결과는 항상 "system"/"light"다. 저장된 선택과 운영체제 판정은 마운트 뒤 첫 effect에서 반영하므로
 * 서버 HTML과 첫 클라이언트 렌더가 같아져 수화 불일치가 생기지 않는다. 실제 색상은 `<html>`에 이미 붙은 클래스가
 * 정하고, 그 클래스는 이 컴포넌트가 렌더하는 사전 스크립트가 첫 페인트 전에 붙인다. 그래서 화면이 깜빡이지 않는다.
 *
 * "system"을 고른 동안에만 운영체제 변경 알림을 구독한다. 라이트·다크를 직접 고르면 구독하지 않으므로
 * 운영체제 설정이 바뀌어도 사용자의 선택이 유지된다.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // 저장된 선택과 실제 색상 모드를 마운트 뒤에 한 번 맞춘다. 서버 렌더에는 저장소가 없으므로 초기 렌더에서는 건드리지 않는다.
  useEffect(() => {
    const stored = readStoredChoice();
    const next = resolveTheme(stored);
    applyTheme(next);
    setChoice(stored);
    setResolved(next);
  }, []);

  // "system" 선택 중에만 운영체제 변경을 따라간다. 수동 선택은 이 구독이 없어 그대로 유지된다.
  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      const next: ResolvedTheme = event.matches ? "dark" : "light";
      applyTheme(next);
      setResolved(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  const setTheme = useCallback((next: ThemeChoice) => {
    const nextResolved = resolveTheme(next);
    applyTheme(nextResolved);
    persistChoice(next);
    setChoice(next);
    setResolved(nextResolved);
  }, []);

  const value = useMemo(
    () => ({ choice, resolved, setTheme }),
    [choice, resolved, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {/* 사전 스크립트는 children보다 먼저 나가야 첫 페인트 전에 실행된다. 비동기 스크립트가 아니므로 위치가 유지된다. */}
      <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      {children}
    </ThemeContext.Provider>
  );
}

/** 색상 모드 선택과 적용 함수를 읽는다. Provider 밖에서 호출하면 실수를 바로 드러내기 위해 예외를 던진다. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme는 ThemeProvider 안에서만 사용할 수 있습니다.");
  }
  return context;
}
