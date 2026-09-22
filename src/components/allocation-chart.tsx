"use client";

import {
  type ComponentProps,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Cell, Pie, PieChart, type PieLabelRenderProps } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type {
  AllocationChartView,
  AllocationSlice,
} from "@/domain/portfolio-allocation";
import { formatPercent } from "@/lib/decimal";

/**
 * 도넛 조각·범례 점 색이다. 상위 조각 순서(1~5)대로 붙는 범주형 토큰이며, 상위 밖을 묶은 "기타" 조각은 `--chart-6` 중립색을 쓴다.
 * 색은 비중 순서만 나타내고 수익·손실 같은 의미를 담지 않는다. 다크는 네온 계열, 라이트는 같은 계열을 짙게 쓴 값이 `globals.css`에 있다.
 * 조각과 범례는 같은 선형 그라데이션을 쓴다. 인포그래픽은 각 조각의 왼쪽 기본색에서 오른쪽 밝은색으로 흐르며, 기본 도넛의 대각선 방향은 유지한다.
 */
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

const chartConfig = {
  value: {
    label: "평가금액 비중",
  },
} satisfies ChartConfig;

/**
 * 도넛을 인포그래픽 구성으로 그릴 때 필요한 표시 설정이다. 지정하지 않으면 저장된 기본 도넛·툴팁 구성을 그대로 쓴다.
 * 사진은 로컬 자산 경로로 전달하며, 원본 출처와 사용 조건은 README에서 관리한다.
 */
export type AllocationChartPresentation = Readonly<{
  /** 사진이 있으면 도넛 아래에, 없으면 중앙에 표시할 사람·운용사 이름이다. */
  name: string;
  /** 중앙 인물 사진이다. 없으면 이름만 표시한다. */
  portrait?: Readonly<{
    src: string;
  }>;
}>;

/** 바깥 두 줄 라벨이 모두 들어가는 가장 큰 도넛을 선택한다. 비중·조각 각도는 바꾸지 않는다. */
const INFOGRAPHIC_OUTER_RADIUS_STEPS = [
  0.86, 0.82, 0.78, 0.74, 0.7, 0.66, 0.62, 0.58, 0.54, 0.5, 0.46, 0.42, 0.38,
  0.34, 0.3,
] as const;
const INFOGRAPHIC_INNER_RADIUS_RATIO = 0.674;
/** Pie에 넘기는 값과 같아야 라벨·화살촉이 실제 조각을 가리킨다. */
const INFOGRAPHIC_PADDING_ANGLE = 1.2;

/**
 * 조각 중앙을 고정한 채 큰 글자부터 축소하는 (표식, 비중) 글꼴 조합이다.
 * 두 줄을 넣을 수 없으면 비중을 생략하지 않고 라벨 전체를 바깥으로 옮긴다.
 */
const STACK_FONT_PAIRS = [
  [18, 14],
  [16, 12],
  [14, 12],
  [12, 12],
] as const;

/**
 * 글꼴 크기별 Tailwind 클래스다. JIT가 소스에서 클래스 이름을 찾으므로 조합식으로 만들지 않고 그대로 적어 둔다.
 * SVG 글자 크기는 컨테이너가 아니라 라벨 함수가 조각마다 정하므로 표에서 골라 쓴다.
 */
const LABEL_FONT_CLASSES: Record<number, string> = {
  12: "text-[12px]",
  14: "text-[14px]",
  16: "text-[16px]",
  18: "text-[18px]",
};

/** 글자 외곽선과 조각 경계 사이의 여유를 함께 포함한 배치 상자의 추가 폭·높이다. */
const LABEL_STROKE_WIDTH = 5;

/** 바깥 라벨은 두 줄·최소 12px를 유지하고 글자 외곽선까지 배치 상자에 포함한다. */
const OUTSIDE_LABEL_FONT_SIZE = 12;
const OUTSIDE_LABEL_PADDING = 4;
const OUTSIDE_LABEL_GAP = 6;
/** 라벨과 원 사이에 지시선 전용 공간을 남겨 선이 글자나 조각에 붙어 보이지 않게 한다. */
const OUTSIDE_LABEL_CLEARANCE = 14;
const ARROW_STROKE_WIDTH = 1.25;
const ARROW_HEAD_LENGTH = 5;
const ARROW_HEAD_SPREAD_DEGREES = 26;
const ARROW_LABEL_GAP = 4;

/**
 * 극좌표의 한 점을 SVG 좌표로 옮긴다. recharts가 조각을 배치할 때 쓰는 규칙과 같다.
 * 각도는 3시 방향이 0도이고 반시계 방향이 양수이며, SVG는 y가 아래로 커지므로 사인 부호를 뒤집는다.
 */
function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radian = (-angle * Math.PI) / 180;

  return {
    x: cx + Math.cos(radian) * radius,
    y: cy + Math.sin(radian) * radius,
  };
}

/** 조각 라벨을 배치할 때 쓰는 실제 렌더 기하 정보다. 각도는 3시 방향이 0도이고 반시계 방향이 양수다. */
type SliceLabelArea = {
  cx: number;
  cy: number;
  /** 도넛의 안쪽·바깥쪽 반지름이다. 글자 상자가 이 둘 사이를 벗어나면 조각 밖으로 넘친 것으로 본다. */
  innerRadius: number;
  outerRadius: number;
  /** ResizeObserver로 측정한 실제 SVG 크기다. 바깥 라벨도 이 경계를 벗어나지 않아야 한다. */
  boxWidth: number;
  boxHeight: number;
  /** 조각 중심선 각도와 조각 각도의 절반이다. */
  midAngle: number;
  halfAngle: number;
  /** 도넛 두께의 중간 반지름이다. 글꼴을 줄여도 조각 중앙 위치는 바꾸지 않는다. */
  midRadius: number;
  arcWidth: number;
};

/**
 * 축에 나란한 글자 상자가 조각 안에 들어가는지 본다. 네 모서리가 모두 두 반지름 사이에 있고
 * 조각 중심선에서 조각 각도의 절반 안에 있어야 글자가 이웃 조각으로 넘치지 않는다.
 */
function fitsInsideSlice(
  area: SliceLabelArea,
  width: number,
  height: number,
): boolean {
  const center = polarPoint(area.cx, area.cy, area.midRadius, area.midAngle);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  // 모서리만 검사하면 글자 상자의 중간이 사진 영역에 걸칠 수 있으므로 원에 가장 가까운 점도 검사한다.
  if (
    Math.hypot(
      Math.max(0, Math.abs(center.x - area.cx) - halfWidth),
      Math.max(0, Math.abs(center.y - area.cy) - halfHeight),
    ) < area.innerRadius
  )
    return false;

  for (const dx of [-halfWidth, halfWidth]) {
    for (const dy of [-halfHeight, halfHeight]) {
      const x = center.x + dx;
      const y = center.y + dy;
      const radius = Math.hypot(x - area.cx, y - area.cy);

      if (radius < area.innerRadius || radius > area.outerRadius) return false;

      // polarPoint와 같은 규칙(y가 아래로 커짐)으로 각도를 되돌리고, 차이를 -180~180도로 접어
      // 조각이 0도나 360도를 걸쳐도 같은 결과를 얻는다.
      const angle = (Math.atan2(area.cy - y, x - area.cx) * 180) / Math.PI;
      const offset = ((angle - area.midAngle + 540) % 360) - 180;

      if (Math.abs(offset) > area.halfAngle) return false;
    }
  }

  return true;
}

/** SVG 라벨의 글자 폭과 알파벳 기준선 위·아래 높이다. 비중은 tabular-nums에 맞춰 측정한다. */
type LabelTextMetrics = { width: number; ascent: number; descent: number };
type MeasureLabelText = (
  text: string,
  fontSize: number,
  weight: 500 | 600,
) => LabelTextMetrics;

/** 서버 렌더와 웹폰트 준비 전의 보수적 치수다. 클라이언트에서는 같은 글꼴의 실제 측정치로 대체한다. */
const estimateLabelText: MeasureLabelText = (text, fontSize) => {
  let width = 0;
  for (const char of text) {
    width += ((char.codePointAt(0) ?? 0) > 127 ? 1 : 0.72) * fontSize;
  }
  return { width, ascent: fontSize * 0.8, descent: fontSize * 0.2 };
};

/**
 * 주어진 폭에 들어가도록 발행사 이름을 줄인다. 단어 경계가 있으면 그 앞에서 자르고 끝에 말줄임표를 붙인다.
 * 안쪽 라벨에서 이름을 식별할 글자가 남지 않으면 호출부가 바깥 라벨로 전환한다.
 */
function shortenToWidth(
  text: string,
  fontSize: number,
  maxWidth: number,
  measure: MeasureLabelText,
): string {
  if (measure(text, fontSize, 600).width <= maxWidth) return text;

  let head = "";

  for (const char of text) {
    if (measure(`${head}${char}…`, fontSize, 600).width > maxWidth) break;

    head += char;
  }

  const boundary = head.lastIndexOf(" ");

  return `${(boundary > 0 ? head.slice(0, boundary) : head).trimEnd()}…`;
}

/** 두 줄의 실제 글자 경계 전체가 중앙에 놓이도록 상자 크기와 각 줄의 알파벳 기준선을 계산한다. */
function labelTextBox(
  text: string,
  percent: string,
  font: number,
  percentFont: number,
  measure: MeasureLabelText,
) {
  const marker = measure(text, font, 600);
  const value = measure(percent, percentFont, 500);
  const height =
    marker.ascent + marker.descent + 3 + value.ascent + value.descent;
  return {
    width: Math.max(marker.width, value.width) + LABEL_STROKE_WIDTH,
    height: height + LABEL_STROKE_WIDTH,
    textBaseline: -height / 2 + marker.ascent,
    percentBaseline: height / 2 - value.descent,
  };
}

/**
 * 조각 안에 쓸 짧은 표식이다. 확인된 티커를 쓰고, 없으면 순번 같은 임시 기호 대신 아래 목록과 같은 발행사 이름을 쓴다.
 * 이름이 비어 있으면 목록과 같이 줄표로 대신한다.
 */
function sliceMarkerText(slice: AllocationSlice): string {
  if (slice.isOther) return "기타";
  if (slice.ticker) return slice.ticker;

  return slice.label.trim() || "—";
}

type SliceLabelPlan = {
  key: string;
  text: string;
  percent: string;
  font: number;
  percentFont: number;
  x: number;
  y: number;
  width: number;
  height: number;
  textBaseline: number;
  percentBaseline: number;
  outside: boolean;
  area: SliceLabelArea;
  arrow?: string;
};

/** 각 조각 중앙에서 두 줄 글꼴만 축소한다. 12px까지 맞지 않을 때만 표식·비중 전체를 밖으로 옮긴다. */
function planSliceLabel(
  slice: AllocationSlice,
  area: SliceLabelArea,
  measure: MeasureLabelText,
): SliceLabelPlan {
  const marker = sliceMarkerText(slice);
  const shortenable = !slice.isOther && !slice.ticker;
  const percent = formatPercent(slice.percent);
  for (const [font, percentFont] of STACK_FONT_PAIRS) {
    const text = shortenable
      ? shortenToWidth(marker, font, area.arcWidth, measure)
      : marker;
    if (text.endsWith("…") && text.length < 4) continue;
    const box = labelTextBox(text, percent, font, percentFont, measure);
    if (!fitsInsideSlice(area, box.width, box.height)) continue;
    return {
      key: slice.key,
      text,
      percent,
      font,
      percentFont,
      ...box,
      ...polarPoint(area.cx, area.cy, area.midRadius, area.midAngle),
      outside: false,
      area,
    };
  }
  // 티커·비중은 자르지 않는다. 긴 발행사 이름만 축약하며 원문 이름은 상시 목록에 남긴다.
  const text = shortenable
    ? shortenToWidth(
        marker,
        OUTSIDE_LABEL_FONT_SIZE,
        Math.min(84, area.boxWidth * 0.2),
        measure,
      )
    : marker;
  return {
    key: slice.key,
    text,
    percent,
    font: OUTSIDE_LABEL_FONT_SIZE,
    percentFont: OUTSIDE_LABEL_FONT_SIZE,
    ...labelTextBox(
      text,
      percent,
      OUTSIDE_LABEL_FONT_SIZE,
      OUTSIDE_LABEL_FONT_SIZE,
      measure,
    ),
    ...polarPoint(area.cx, area.cy, area.outerRadius, area.midAngle),
    outside: true,
    area,
  };
}

/**
 * 바깥 라벨은 조각 방향에 가까운 위·아래·좌·우에 나누고 이웃 사이의 간격만 벌린다.
 * 글자 상자 전체를 원 밖에 두며 직선이 원을 관통하거나 화면 밖으로 나가면 더 작은 도넛으로 다시 계산한다.
 */
function placeOutsideLabels(labels: SliceLabelPlan[]): boolean {
  const outside = labels.filter((label) => label.outside);
  for (let direction = 0; direction < 4; direction += 1) {
    const group = outside.filter(
      ({ area }) => Math.floor(((area.midAngle + 45) % 360) / 90) === direction,
    );
    if (group.length === 0) continue;
    const horizontal = direction % 2 === 1;
    const primary = horizontal ? "y" : "x";
    const secondary = horizontal ? "x" : "y";
    const sign = direction === 0 || direction === 3 ? 1 : -1;
    const { cx, cy, boxWidth, boxHeight, outerRadius } = group[0].area;
    const center = horizontal ? cy : cx;
    const secondaryCenter = horizontal ? cx : cy;
    const limit = horizontal ? boxWidth : boxHeight;
    let desiredSum = 0;
    for (const label of group) {
      const unit = polarPoint(0, 0, 1, label.area.midAngle);
      const distance =
        outerRadius +
        OUTSIDE_LABEL_CLEARANCE +
        (Math.abs(unit.x) * label.width) / 2 +
        (Math.abs(unit.y) * label.height) / 2;
      label[secondary] = secondaryCenter + unit[secondary] * distance;
      desiredSum += label[secondary];
    }
    group.sort((a, b) => a[secondary] - b[secondary]);
    let boundary = OUTSIDE_LABEL_PADDING;
    let placedSum = 0;
    for (const label of group) {
      const size = horizontal ? label.width : label.height;
      label[secondary] = Math.max(label[secondary], boundary + size / 2);
      boundary = label[secondary] + size / 2 + OUTSIDE_LABEL_GAP;
      placedSum += label[secondary];
    }
    const first = group[0];
    const last = group[group.length - 1];
    const start =
      first[secondary] - (horizontal ? first.width : first.height) / 2;
    const end = last[secondary] + (horizontal ? last.width : last.height) / 2;
    if (end - start > limit - OUTSIDE_LABEL_PADDING * 2) return false;
    // 한 방향으로만 밀지 않고 원래 중심에서 양쪽으로 나눠 벌려 직선 길이를 최소화한다.
    const shift = Math.max(
      OUTSIDE_LABEL_PADDING - start,
      Math.min(
        (desiredSum - placedSum) / group.length,
        limit - OUTSIDE_LABEL_PADDING - end,
      ),
    );
    let rowEdge = 0;
    for (const label of group) {
      label[secondary] += shift;
      const size = horizontal ? label.width : label.height;
      const nearest = Math.max(
        0,
        Math.abs(label[secondary] - secondaryCenter) - size / 2,
      );
      const tip = polarPoint(cx, cy, outerRadius, label.area.midAngle);
      rowEdge = Math.max(
        rowEdge,
        sign * (tip[primary] - center),
        Math.sqrt(Math.max(0, outerRadius ** 2 - nearest ** 2)),
      );
    }
    rowEdge += OUTSIDE_LABEL_CLEARANCE;
    for (const label of group) {
      label[primary] =
        center +
        sign * (rowEdge + (horizontal ? label.height : label.width) / 2);
      if (
        label.x - label.width / 2 < OUTSIDE_LABEL_PADDING ||
        label.x + label.width / 2 > boxWidth - OUTSIDE_LABEL_PADDING ||
        label.y - label.height / 2 < OUTSIDE_LABEL_PADDING ||
        label.y + label.height / 2 > boxHeight - OUTSIDE_LABEL_PADDING
      )
        return false;
      const tip = polarPoint(cx, cy, outerRadius, label.area.midAngle);
      const edge = outsideLabelEdge(label);
      // 조각 끝의 접선보다 바깥을 향하면 직선 전체가 도넛을 관통하지 않는다.
      if ((edge.x - tip.x) * (tip.x - cx) + (edge.y - tip.y) * (tip.y - cy) < 0)
        return false;
    }
  }
  // 서로 다른 방향의 묶음도 모서리에서 겹치지 않아야 한다.
  for (let index = 0; index < outside.length; index += 1) {
    for (let other = index + 1; other < outside.length; other += 1) {
      const a = outside[index];
      const b = outside[other];
      if (
        Math.abs(a.x - b.x) < (a.width + b.width) / 2 + OUTSIDE_LABEL_GAP &&
        Math.abs(a.y - b.y) < (a.height + b.height) / 2 + OUTSIDE_LABEL_GAP
      )
        return false;
    }
  }
  return true;
}

/**
 * 라벨 묶음에서 원을 향한 면의 중앙 직전까지 직선을 잇는다.
 * 같은 면에서 선을 멈춰 가까운 극소 조각의 선도 이웃 글자 사이로 들어가지 않으며 글자에는 4px 여백을 둔다.
 */
function outsideLabelEdge(label: SliceLabelPlan) {
  const direction = Math.floor(((label.area.midAngle + 45) % 360) / 90);
  if (direction === 0)
    return { x: label.x - label.width / 2 - ARROW_LABEL_GAP, y: label.y };
  if (direction === 1)
    return { x: label.x, y: label.y + label.height / 2 + ARROW_LABEL_GAP };
  if (direction === 2)
    return { x: label.x + label.width / 2 + ARROW_LABEL_GAP, y: label.y };
  return { x: label.x, y: label.y - label.height / 2 - ARROW_LABEL_GAP };
}

/** path 데이터의 좌표를 소수 둘째 자리로 줄여 출력 문자열이 불필요하게 길어지지 않게 한다. */
function pathCoord(value: number): string {
  return `${Math.round(value * 100) / 100}`;
}

/** 조각의 바깥 호 중앙부터 라벨까지 직선 하나로 연결하며 작은 화살촉도 같은 직선 방향에 맞춘다. */
function outsideArrowPath(label: SliceLabelPlan): string {
  const { cx, cy, outerRadius, midAngle, halfAngle } = label.area;
  const tip = polarPoint(cx, cy, outerRadius, midAngle);
  const edge = outsideLabelEdge(label);
  const outward = Math.atan2(edge.y - tip.y, edge.x - tip.x);
  const point = (value: { x: number; y: number }) =>
    `${pathCoord(value.x)} ${pathCoord(value.y)}`;
  const body = `M ${point(tip)} L ${point(edge)}`;
  // 조각 사이 간격보다 넓은 화살촉은 이웃 화살촉과 붙으므로 극소 비중에서는 폭만 좁힌다.
  const headRoom =
    (outerRadius + ARROW_HEAD_LENGTH) *
    Math.sin(((halfAngle + INFOGRAPHIC_PADDING_ANGLE / 2) * Math.PI) / 180) *
    0.75;
  const spread = Math.min(
    (ARROW_HEAD_SPREAD_DEGREES * Math.PI) / 180,
    Math.asin(Math.min(1, headRoom / ARROW_HEAD_LENGTH)),
    // 접선에 가까운 직선도 화살촉의 양쪽 끝이 도넛 안으로 꺾이지 않게 제한한다.
    Math.asin(Math.max(0, Math.cos(outward + (midAngle * Math.PI) / 180))),
  );
  const upper = {
    x: tip.x + Math.cos(outward + spread) * ARROW_HEAD_LENGTH,
    y: tip.y + Math.sin(outward + spread) * ARROW_HEAD_LENGTH,
  };
  const lower = {
    x: tip.x + Math.cos(outward - spread) * ARROW_HEAD_LENGTH,
    y: tip.y + Math.sin(outward - spread) * ARROW_HEAD_LENGTH,
  };
  return `${body} M ${point(upper)} L ${point(tip)} L ${point(lower)}`;
}

/** 같은 크기·비중에는 같은 배치를 쓰고, 모든 라벨이 여백 안에 들어가는 가장 큰 반지름을 선택한다. */
function planInfographicLabels(
  slices: readonly AllocationSlice[],
  width: number,
  height: number,
  measure: MeasureLabelText,
) {
  const total = slices.reduce((sum, slice) => sum + slice.percent, 0);
  // Recharts는 전원형의 양수 조각이 여러 개일 때 마지막 조각과 첫 조각 사이에도 간격을 둔다.
  const availableAngle =
    360 - (slices.length > 1 ? slices.length * INFOGRAPHIC_PADDING_ANGLE : 0);
  let labels: SliceLabelPlan[] = [];
  let outerRadius = 0;
  let innerRadius = 0;
  for (const ratio of INFOGRAPHIC_OUTER_RADIUS_STEPS) {
    outerRadius = (Math.min(width, height) * ratio) / 2;
    // 작은 화면에서도 두 줄 상자가 들어갈 두께를 먼저 확보하되 중앙 구멍의 지름은 도넛의 40% 이상 남긴다.
    innerRadius =
      outerRadius -
      Math.min(
        outerRadius * 0.6,
        Math.max(60, outerRadius * (1 - INFOGRAPHIC_INNER_RADIUS_RATIO)),
      );
    let angle = 0;
    labels = slices.map((slice) => {
      const span = (availableAngle * slice.percent) / total;
      const midAngle = angle + span / 2;
      angle += span + INFOGRAPHIC_PADDING_ANGLE;
      const midRadius = (innerRadius + outerRadius) / 2;
      return planSliceLabel(
        slice,
        {
          cx: width / 2,
          cy: height / 2,
          innerRadius,
          outerRadius,
          boxWidth: width,
          boxHeight: height,
          midAngle,
          halfAngle: span / 2,
          midRadius,
          arcWidth: (span * Math.PI * midRadius) / 180,
        },
        measure,
      );
    });
    if (placeOutsideLabels(labels)) break;
  }
  for (const label of labels) {
    if (label.outside) label.arrow = outsideArrowPath(label);
  }
  return {
    labels,
    outerRadius,
    innerRadius,
    portraitRadius: Math.max(0, innerRadius - width * 0.02),
  };
}

/** 사람 이름은 두 줄로, 긴 영문 펀드명은 단어 경계를 보존한 짧은 여러 줄로 나눠 도넛 안에 표시한다. */
function splitNameLines(name: string): string[] {
  const words = name.trim().split(/\s+/);

  if (words.length <= 2) return words;

  const lines: string[] = [];
  for (const word of words) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + word.length + 1 <= 16) {
      lines[last] += ` ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines;
}

/**
 * 저장된 평가금액 구성을 도넛과 접근 가능한 텍스트 목록으로 표시하는 공통 표현 컴포넌트다.
 * 금액 포맷·비중 계산·출처별 문구는 SEC/ARK 어댑터가 끝내고 전달하며, 이 컴포넌트는 표시만 담당한다.
 * presentation이 있으면 도넛을 키우고 공간에 따라 조각 안·밖에 표식과 비중, 중앙에 사진 또는 이름을 넣는다.
 * 툴팁과 키보드 탐색은 쓰지 않으며 같은 정보는 아래 목록이 순번·금액과 함께 모두 담당한다.
 * unavailableMessage가 있으면 목록·도넛까지 차트 영역 전체를 안내로 대체하고, 조각이 없으면 emptyMessage를 보여 준다.
 */
export function AllocationChart({
  headingId,
  title,
  subtitle,
  totalLabel,
  view,
  footnotes,
  presentation,
}: {
  headingId: string;
  title: string;
  subtitle: string;
  totalLabel: string;
  view: AllocationChartView;
  footnotes: string[];
  /** 인포그래픽 표시 설정이다. 없으면 저장된 기본 도넛·툴팁 구성을 그대로 쓴다. */
  presentation?: AllocationChartPresentation;
}) {
  // 같은 화면에 여러 차트가 있어도 SVG paint server가 충돌하지 않도록 인스턴스별 ID를 쓴다.
  const gradientId = useId().replace(/:/g, "");
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [tooltipTrigger, setTooltipTrigger] = useState<"hover" | "click">(
    "hover",
  );
  const infographic = presentation !== undefined;
  const chartColumnRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 320, height: 432 });
  const [measureText, setMeasureText] = useState<MeasureLabelText>(
    () => estimateLabelText,
  );
  useEffect(() => {
    if (!infographic || view.slices.length === 0 || view.unavailableMessage)
      return;
    const element = chartColumnRef.current?.querySelector(
      '[data-slot="chart"]',
    );
    if (!element) return;
    // 실제 SVG의 가로·세로를 함께 관찰해 모바일 폭과 바깥 라벨용 세로 여백을 배치에 반영한다.
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setChartSize((previous) =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height },
        );
      }
    });
    observer.observe(element);
    let active = true;
    // 서버에서 글자 폭을 추측해 작고 읽을 수 있는 라벨까지 밖으로 보내지 않도록 실제 웹폰트 로딩 뒤 측정한다.
    void document.fonts.ready.then(() => {
      if (!active) return;
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;
      const family = getComputedStyle(element).fontFamily;
      setMeasureText(
        () => (text: string, fontSize: number, weight: 500 | 600) => {
          context.font = `${weight} ${fontSize}px ${family}`;
          // 비중의 tabular-nums는 숫자마다 같은 폭을 쓰므로 0의 폭으로 재어 비례 숫자 폭을 과소평가하지 않는다.
          const metrics = context.measureText(
            weight === 500 ? text.replace(/\d/g, "0") : text,
          );
          return {
            width: Math.max(
              metrics.width,
              metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
            ),
            ascent: metrics.actualBoundingBoxAscent,
            descent: metrics.actualBoundingBoxDescent,
          };
        },
      );
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [infographic, view.slices.length, view.unavailableMessage]);
  const layout = useMemo(
    () =>
      infographic
        ? planInfographicLabels(
            view.slices,
            chartSize.width,
            chartSize.height,
            measureText,
          )
        : null,
    [infographic, view.slices, chartSize, measureText],
  );
  const centerLines = presentation ? splitNameLines(presentation.name) : [];
  const chartData = view.slices.map((slice, index) => ({
    ...slice,
    fill: slice.isOther ? "var(--chart-6)" : CHART_COLORS[index],
    highlight: `var(--chart-${slice.isOther ? 6 : index + 1}-highlight)`,
  }));
  /**
   * 차트 컨테이너의 포인터·포커스 처리다. 인포그래픽 구성은 툴팁도 키보드 탐색도 쓰지 않으므로 연결하지 않는다.
   * 터치에는 hover가 없으므로 탭으로 선택하고, 마우스로 돌아오면 hover 탐색을 복원한다.
   */
  const chartInteractionProps: Pick<
    ComponentProps<"div">,
    | "onPointerDownCapture"
    | "onPointerMoveCapture"
    | "onFocusCapture"
    | "onBlurCapture"
  > = infographic
    ? {}
    : {
        onPointerDownCapture: (event) => {
          setTooltipTrigger(event.pointerType === "touch" ? "click" : "hover");
        },
        onPointerMoveCapture: (event) => {
          if (event.pointerType === "mouse" && tooltipTrigger !== "hover") {
            setTooltipTrigger("hover");
          }
        },
        onFocusCapture: () => setKeyboardFocused(true),
        onBlurCapture: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setKeyboardFocused(false);
          }
        },
      };
  /** 하나의 배치 결과를 Pie·사진·전체 라벨이 공유한다. 개별 조각의 렌더 순서에 의존하지 않는다. */
  const renderSliceLabel = (props: PieLabelRenderProps) => {
    if (props.index !== 0 || !layout) return <g />;
    return (
      <g>
        {layout.labels.map((label) => (
          <g key={label.key}>
            {label.outside && (
              // 직선 하나가 조각 중앙과 바깥 라벨을 잇는다. 같은 정보는 상시 목록에도 있으므로 보조기기·포인터에 관여하지 않는다.
              <path
                d={label.arrow}
                fill="none"
                stroke="var(--muted-foreground)"
                strokeWidth={ARROW_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}
            <text
              x={label.x}
              y={label.y + label.textBaseline}
              textAnchor="middle"
              stroke="var(--card)"
              strokeWidth={3}
              paintOrder="stroke"
              className={`fill-foreground font-semibold ${LABEL_FONT_CLASSES[label.font]}`}
            >
              {label.text}
            </text>
            <text
              x={label.x}
              y={label.y + label.percentBaseline}
              textAnchor="middle"
              stroke="var(--card)"
              strokeWidth={3}
              paintOrder="stroke"
              className={`fill-foreground font-medium tabular-nums ${LABEL_FONT_CLASSES[label.percentFont]}`}
            >
              {label.percent}
            </text>
          </g>
        ))}
      </g>
    );
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="text-xl leading-7 font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <p className="max-w-full break-all font-sans text-sm tabular-nums text-muted-foreground">
          {totalLabel}
        </p>
      </div>

      {view.unavailableMessage ? (
        <div className="mt-5 flex min-h-60 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 text-center text-sm leading-6 text-muted-foreground">
          {view.unavailableMessage}
        </div>
      ) : view.slices.length === 0 ? (
        <div className="mt-6 flex min-h-60 items-center justify-center border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
          {view.emptyMessage}
        </div>
      ) : (
        <div
          className={`mt-5 grid gap-5 lg:items-center ${
            infographic
              ? "lg:grid-cols-[26rem_minmax(0,1fr)]"
              : "lg:grid-cols-[18rem_minmax(0,1fr)]"
          }`}
        >
          <ul className="order-2 min-w-0 divide-y divide-border">
            {chartData.map((slice, index) => (
              <li
                key={slice.key}
                className="flex gap-3 py-3 first:pt-3 last:pb-3"
              >
                {infographic && (
                  <span className="mt-0.5 w-4 shrink-0 text-right font-sans text-xs leading-4 tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                )}
                <svg
                  aria-hidden="true"
                  className="mt-1.5 size-2.5 shrink-0 overflow-visible"
                  viewBox="0 0 10 10"
                >
                  <circle
                    cx="5"
                    cy="5"
                    r="5"
                    fill={`url(#${gradientId}-${index})`}
                    filter={
                      slice.isOther ? undefined : `url(#${gradientId}-glow)`
                    }
                  />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 break-words text-base leading-6 font-medium text-foreground">
                      {slice.label}
                      {slice.ticker && (
                        <span className="ml-2 font-sans text-sm font-medium tabular-nums text-muted-foreground">
                          {slice.ticker}
                        </span>
                      )}
                    </p>
                    <p className="shrink-0 font-sans text-sm font-medium tabular-nums text-foreground">
                      {formatPercent(slice.percent)}
                    </p>
                  </div>
                  <p className="mt-1 break-words font-sans text-sm leading-5 text-muted-foreground">
                    {slice.detail}
                  </p>
                  <p className="mt-1 break-all font-sans text-sm leading-5 tabular-nums text-muted-foreground">
                    {slice.amountLabel}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div
            ref={chartColumnRef}
            className="order-1 flex min-h-64 min-w-0 flex-col items-center justify-center"
          >
            {infographic && (
              <p className="mb-3 text-center text-sm leading-6 text-muted-foreground">
                {view.topLabel}{" "}
                <span className="font-sans text-lg font-semibold tabular-nums text-foreground">
                  {formatPercent(view.topPercent)}
                </span>
              </p>
            )}
            <ChartContainer
              config={chartConfig}
              initialDimension={{ width: 320, height: infographic ? 432 : 320 }}
              // Pie의 className은 각 조각에도 복제되므로 컨테이너에서 루트 그룹만 선택해 그림자를 한 번 적용한다.
              className={
                infographic
                  ? "aspect-[1/1.35] w-full max-w-[26rem] sm:aspect-[1/1.2] [&_.recharts-pie]:drop-shadow-xl dark:[&_.recharts-pie]:drop-shadow-black/35"
                  : "aspect-square w-full max-w-72 [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-solid [&_.recharts-surface:focus-visible]:outline-ring"
              }
              // 인포그래픽 도넛이 담은 값은 아래 목록이 순번과 함께 모두 담당하므로 보조기기에서는 숨긴다.
              aria-hidden={infographic || undefined}
              {...chartInteractionProps}
            >
              <PieChart
                margin={
                  infographic
                    ? { top: 0, right: 0, bottom: 0, left: 0 }
                    : undefined
                }
                accessibilityLayer={!infographic}
                aria-label={
                  infographic
                    ? undefined
                    : "평가금액 비중 차트. 좌우 방향키로 항목 이동"
                }
              >
                <defs>
                  {presentation?.portrait && (
                    <clipPath id={`${gradientId}-portrait`}>
                      <circle cx="50%" cy="50%" r={layout?.portraitRadius} />
                    </clipPath>
                  )}
                  {chartData.map((slice, index) => (
                    <linearGradient
                      key={slice.key}
                      id={`${gradientId}-${index}`}
                      // SVG 전체가 아니라 각 조각의 경계 상자에 맞춰 작은 조각에도 전체 색 변화가 보이게 한다.
                      gradientUnits="objectBoundingBox"
                      x1="0%"
                      y1={infographic ? "0%" : "100%"}
                      x2="100%"
                      y2="0%"
                    >
                      <stop offset="0%" stopColor={slice.fill} />
                      <stop offset="100%" stopColor={slice.highlight} />
                    </linearGradient>
                  ))}
                  <filter
                    id={`${gradientId}-glow`}
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                  >
                    <feGaussianBlur
                      in="SourceGraphic"
                      stdDeviation="2"
                      result="blur"
                    />
                    <feFlood
                      floodColor="white"
                      style={{ floodOpacity: "var(--chart-glow)" }}
                    />
                    <feComposite in="blur" operator="in" />
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {/* 인포그래픽 구성은 툴팁 없이 조각 안·밖 라벨과 아래 목록을 사용한다. */}
                {!infographic && (
                  <ChartTooltip
                    // Recharts의 item 툴팁은 최초 포인터 선택 전 계열을 찾지 못하므로 키보드 포커스 중에만 초기 항목을 제공한다.
                    defaultIndex={keyboardFocused ? 0 : undefined}
                    trigger={tooltipTrigger}
                    isAnimationActive={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(_, __, item) => {
                          const payload =
                            item.payload as (typeof chartData)[number];

                          return (
                            <div className="grid max-w-64 gap-1 whitespace-normal">
                              <span className="font-medium">
                                {payload.label}
                                {payload.ticker && (
                                  <span className="ml-2 font-sans text-xs font-medium tabular-nums text-muted-foreground">
                                    {payload.ticker}
                                  </span>
                                )}
                              </span>
                              <span className="text-muted-foreground">
                                {payload.detail}
                              </span>
                              <span className="font-sans font-medium tabular-nums text-foreground">
                                {payload.amountLabel} ·{" "}
                                {formatPercent(payload.percent)}
                              </span>
                            </div>
                          );
                        }}
                      />
                    }
                  />
                )}
                <Pie
                  data={chartData}
                  dataKey="percent"
                  nameKey="label"
                  // SVG 루트가 방향키 탐색을 제공하므로 내부 Pie의 중복 Tab 정지는 제거한다.
                  rootTabIndex={-1}
                  innerRadius={layout?.innerRadius ?? "64%"}
                  outerRadius={layout?.outerRadius ?? "88%"}
                  // 안쪽 라벨과 바깥 지시선을 함께 배치하므로 Recharts의 개별 라벨·지시선을 쓰지 않는다.
                  label={infographic ? renderSliceLabel : false}
                  labelLine={false}
                  // 간격을 제외한 각도를 원래 비중대로 배분한다. 작은 조각을 과장하는 minAngle은 쓰지 않고 실제 비중은 라벨·목록에 유지한다.
                  paddingAngle={infographic ? INFOGRAPHIC_PADDING_ANGLE : 0}
                  // 작은 조각은 Recharts가 허용하는 범위에서만 모서리를 둥글린다.
                  cornerRadius={infographic ? 4 : 0}
                  stroke={infographic ? "none" : "var(--card)"}
                  strokeWidth={infographic ? 0 : 2}
                  isAnimationActive={false}
                >
                  {chartData.map((slice, index) => (
                    <Cell
                      key={slice.key}
                      fill={`url(#${gradientId}-${index})`}
                      filter={
                        infographic || slice.isOther
                          ? undefined
                          : `url(#${gradientId}-glow)`
                      }
                    />
                  ))}
                </Pie>
                {presentation?.portrait ? (
                  // 잘린 사진의 바깥 그룹에 그림자를 적용해야 음영이 원형 클립에 잘리지 않는다. 사진 자체는 흐리지 않는다.
                  <g className="drop-shadow-lg dark:drop-shadow-black/35">
                    <image
                      href={presentation.portrait.src}
                      x={chartSize.width / 2 - (layout?.portraitRadius ?? 0)}
                      y={chartSize.height / 2 - (layout?.portraitRadius ?? 0)}
                      width={(layout?.portraitRadius ?? 0) * 2}
                      height={(layout?.portraitRadius ?? 0) * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#${gradientId}-portrait)`}
                    />
                  </g>
                ) : infographic ? (
                  <text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`fill-foreground font-semibold ${centerLines.some((line) => line.length > 10) ? "text-sm" : "text-[19px]"}`}
                  >
                    {centerLines.map((line, index) => (
                      <tspan
                        key={line}
                        x="50%"
                        // 줄 수와 관계없이 이름 블록의 세로 중심을 도넛 중심에 맞춘다.
                        dy={
                          index === 0
                            ? `${-(centerLines.length - 1) * 0.6}em`
                            : "1.2em"
                        }
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                ) : (
                  <>
                    <text
                      x="50%"
                      y="43%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-muted-foreground text-xs"
                    >
                      {view.topLabel}
                    </text>
                    <text
                      x="50%"
                      y="55%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-foreground text-[26px] font-semibold tabular-nums"
                    >
                      {formatPercent(view.topPercent)}
                    </text>
                  </>
                )}
              </PieChart>
            </ChartContainer>
            {presentation?.portrait && (
              <div className="mt-2 text-center">
                <p className="text-base font-semibold text-foreground">
                  {presentation.name}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 space-y-1 text-xs leading-5 text-muted-foreground">
        {footnotes.map((footnote) => (
          <p key={footnote}>{footnote}</p>
        ))}
      </div>
    </section>
  );
}
