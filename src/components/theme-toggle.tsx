"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

const themeModes = {
  light: { label: "라이트", Icon: Sun, next: "dark" },
  dark: { label: "다크", Icon: Moon, next: "light" },
} as const;

/**
 * 실제 적용된 라이트·다크를 표시하고 클릭하면 반대 모드로 전환한다.
 * 초기 시스템 설정은 Provider가 해석하며 시스템 자체를 별도 상태로 노출하지 않는다.
 * 현재 모드와 다음 동작을 접근 가능한 이름·툴팁으로 알린다.
 * 형광색 없이 호버와 키보드 포커스만 중립색으로 강조하며 터치 영역은 44px이다.
 */
export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const { label, Icon, next } = themeModes[resolved];
  const description = `현재 ${label} 테마 · ${themeModes[next].label} 테마로 전환`;

  return (
    <Button
      aria-label={description}
      title={description}
      className="size-11 text-foreground hover:bg-muted hover:text-foreground focus-visible:border-foreground/50 focus-visible:ring-foreground/30"
      size="icon-lg"
      variant="ghost"
      onClick={() => setTheme(next)}
    >
      <Icon aria-hidden="true" className="size-5" />
    </Button>
  );
}
