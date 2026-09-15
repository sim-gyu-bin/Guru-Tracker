/**
 * 공시 금액·수량을 반올림 없이 다루는 십진 유틸이다.
 * SEC 13F는 소수점 없는 USD 정수, ARK는 센트 두 자리 USD 십진을 쓰므로
 * 두 표기를 모두 BigInt로 보존하고 표시 문자열은 마지막 단계에서만 만든다.
 * 전체 금액을 Number로 바꾸는 변환은 하지 않으며 Number는 0~100 비중에만 쓴다.
 */

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
const DECIMAL_PARTS_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

const GROUP_FORMATTER = new Intl.NumberFormat("en-US");

/** 십진 문자열이 소수점 뒤에 가진 자릿수다. 소수점이 없으면 0이다. */
function decimalScale(value: string): number {
  const separatorIndex = value.indexOf(".");

  return separatorIndex < 0 ? 0 : value.length - separatorIndex - 1;
}

/**
 * 원문 십진 문자열을 지정한 소수 자릿수의 정수 BigInt로 바꾼다.
 * 자릿수가 모자라면 0을 채우고, 남는 자릿수는 반올림하지 않고 실패시킨다.
 * SEC 13F 정수 금액은 scale 0, ARK 센트 금액은 scale 2로 호출한다.
 */
export function parseScaledDecimal(value: string, scale: number): bigint {
  const trimmed = value.trim();

  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new RangeError(`유효한 십진 문자열이 아닙니다: ${value}`);
  }

  const negative = trimmed.startsWith("-");
  const digits = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ""] = digits.split(".");

  if (fraction.length > scale) {
    throw new RangeError(
      `소수 자릿수가 ${scale}자를 넘어 정밀도를 잃습니다: ${value}`,
    );
  }

  const scaled = BigInt(`${whole}${fraction.padEnd(scale, "0")}`);

  return negative ? -scaled : scaled;
}

/** 자릿수를 맞춘 정수 BigInt를 다시 십진 문자열로 되돌린다. */
export function formatScaledDecimal(value: bigint, scale: number): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;

  if (scale === 0) {
    return `${negative ? "-" : ""}${absolute.toString()}`;
  }

  const padded = absolute.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, padded.length - scale);
  const fraction = padded.slice(padded.length - scale);

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * 자릿수를 맞춘 정수 BigInt를 통화 표기로 바꾼다.
 * 큰 금액도 Number를 거치지 않으므로 scale 0은 "$1,810", scale 2는 "$1,810.05"가 된다.
 */
export function formatUsdAmount(value: bigint, scale: number): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const divisor = BigInt(10) ** BigInt(scale);
  const whole = GROUP_FORMATTER.format(absolute / divisor);
  const fraction =
    scale === 0
      ? ""
      : `.${(absolute % divisor).toString().padStart(scale, "0")}`;

  return `${negative ? "-" : ""}$${whole}${fraction}`;
}

/**
 * 수량·공식 비중처럼 원문 표기를 그대로 보여야 하는 십진 문자열을 천 단위로만 묶는다.
 * 반올림·자릿수 변경 없이 원문 소수를 유지하며, 해석할 수 없는 값은 손대지 않고 돌려준다.
 */
export function formatDecimalString(value: string): string {
  const match = DECIMAL_PARTS_PATTERN.exec(value.trim());

  if (!match) {
    return value;
  }

  const [, sign, whole, fraction] = match;
  const grouped = GROUP_FORMATTER.format(BigInt(whole));

  return `${sign}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** 소수 자릿수가 다른 두 십진 문자열을 반올림 없이 더한다. */
export function addDecimalStrings(left: string, right: string): string {
  const scale = Math.max(decimalScale(left.trim()), decimalScale(right.trim()));
  const total =
    parseScaledDecimal(left, scale) + parseScaledDecimal(right, scale);

  return formatScaledDecimal(total, scale);
}

/**
 * BigInt 금액의 비율을 차트에만 전달할 0~100 number로 직렬화한다.
 * 큰 금액을 Number로 바꾸지 않고 자릿수 차이에 맞춘 BigInt 나눗셈으로 작은 양수 비율도 유지한다.
 */
export function ratioToPercent(value: bigint, total: bigint): number {
  if (value === BigInt(0) || total === BigInt(0)) {
    return 0;
  }

  const scale =
    18 + Math.max(0, total.toString().length - value.toString().length);
  const scaled = (value * BigInt(100) * BigInt(10) ** BigInt(scale)) / total;
  // 부동소수점 표현 범위보다 작은 양수도 목록에서 0%로 오인되지 않게 한다.
  return Math.max(Number.MIN_VALUE, Number(`${scaled}e-${scale}`));
}

/** 양수인 작은 비중을 0%로 잘못 읽히지 않도록 표시한다. */
export function formatPercent(percent: number): string {
  if (percent > 0 && percent < 0.01) {
    return "<0.01%";
  }

  return `${percent.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}%`;
}
