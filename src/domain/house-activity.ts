import { getHousePtrAssetTicker, type HousePtrTransaction } from "./house";

/**
 * Nancy Pelosi 화면의 자산별 신고 활동 요약 집계.
 *
 * 출처 제약:
 * - 입력은 파서가 검증한 공식 PTR 1건의 거래 행 목록뿐이다. 여러 문서를 합치거나 외부 시세·상장 정보를 붙이지 않는다.
 * - 여기서 세는 값은 원문에 적힌 신고 행 수다. 금액 합계·중간값·자산 비중·보유 수량·보유 현황이 아니며
 *   거래금액 범위 문자열은 집계에 전혀 쓰지 않는다.
 * - 자산명은 원문 문자열을 그대로 쓰고 대소문자·접미사 정규화나 티커 기반 추측 매핑을 하지 않는다.
 */

/**
 * 자산별 신고 활동 요약의 한 항목(막대 1개)이다.
 * 원문 자산명 문자열이 정확히 같고 자산유형 코드 묶음이 같은 행만 한 항목으로 묶는다.
 */
export type HousePtrActivityItem = {
  /** 화면 키(원문 자산명 + 코드 분류). 같은 자산명이라도 코드 분류가 다르면 다른 항목이다. */
  readonly key: string;
  /** 원문 자산명 문자열 그대로. 이름을 줄이거나 다른 자산과 합치지 않는다. */
  readonly asset: string;
  /** 이 항목으로 묶인 원문 자산유형 코드(중복 제거, 코드순). ST와 OP는 한 묶음이므로 함께 나올 수 있다. */
  readonly assetTypeCodes: readonly string[];
  /** 원문 자산명 끝에 제출자가 함께 적은 티커 표기. 없거나 비상장(PS)이면 null. */
  readonly ticker: string | null;
  /** 이 자산이 등장한 신고 행 수(1 이상). */
  readonly transactionCount: number;
};

/**
 * 공식 PTR 1건의 활동 요약. 모든 값은 원문 행 수 기준이다.
 *
 * 불변 조건:
 * - `items`의 `transactionCount` 합은 `transactionCount`와 같다(모든 행이 정확히 한 항목에 속한다).
 * - `optionTransactionCount`는 `transactionCount`의 부분집합이다. 총계에 더하지 않는다.
 * - `items`는 원문 자산명과 자산유형 묶음을 함께 본 식별자 목록이다. 별도 원문 자산명 개수 지표를 두지 않아
 *   요약 숫자와 막대 항목 수가 어긋나지 않는다.
 */
export type HousePtrActivitySummary = {
  /** 원문 표 전체 행 수. */
  readonly transactionCount: number;
  /** 자산유형이 옵션(OP)인 행 수. 총 거래 행의 부분집합이다. */
  readonly optionTransactionCount: number;
  /**
   * 자산별 항목 전체. 원문 자산명과 자산유형 묶음이 같은 행끼리 한 항목이라서 길이가 원문 자산 개수 지표다.
   * 신고 행 수 내림차순, 동률이면 키순으로 안정 정렬한다.
   */
  readonly items: readonly HousePtrActivityItem[];
  /** 항목별 신고 행 수의 최댓값. 막대 길이의 공통 기준(0~max)이며 `items`가 비면 0이다. */
  readonly maxTransactionCount: number;
};

/** 옵션 자산유형 코드. 옵션 행 수는 총 거래 행의 부분집합으로만 센다. */
const OPTION_ASSET_TYPE_CODE = "OP";

/**
 * 상장 주식 코드. 옵션(OP) 행의 원문 자산명은 옵션 계약이 아니라 기초자산 이름이므로 같은 묶음으로 본다.
 * 즉 같은 원문 자산명이 ST·OP로 나뉘어 신고되면 한 항목으로 합친다.
 */
const STOCK_ASSET_TYPE_CODE = "ST";

/** 집계 중간 단계. 코드는 중복을 걷어내려고 집합으로 모은다. */
type MutableActivityItem = {
  readonly key: string;
  readonly asset: string;
  readonly assetTypeCodes: Set<string>;
  readonly ticker: string | null;
  transactionCount: number;
};

/** 신고 행 수 내림차순, 동률이면 키순. 동률 순서가 입력 순서에 따라 달라지지 않게 키로 전순서를 만든다. */
function compareByCountThenKey(
  left: HousePtrActivityItem,
  right: HousePtrActivityItem,
): number {
  if (left.transactionCount !== right.transactionCount) {
    return right.transactionCount - left.transactionCount;
  }

  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}

/**
 * 공식 PTR 1건의 거래 행 목록을 자산별 신고 활동 요약으로 집계한다(표시 전용 순수 함수).
 *
 * 입력: 파서가 이미 검증한 행 목록. 여기서 코드·자산명을 다시 검증하지 않는다.
 * 출력: 행 수 기준 집계. 빈 목록이면 모든 값이 0이고 `items`가 빈 요약을 준다.
 *
 * 실패 조건: 없다(원문 문자열만 세므로 예외를 만들지 않는다). 티커는 같은 항목 안에서 자산명에서 파생되므로
 * 항목마다 한 번만 계산한다.
 */
export function buildHousePtrActivitySummary(
  transactions: readonly HousePtrTransaction[],
): HousePtrActivitySummary {
  const items = new Map<string, MutableActivityItem>();
  let optionTransactionCount = 0;

  for (const transaction of transactions) {
    if (transaction.assetTypeCode === OPTION_ASSET_TYPE_CODE) {
      optionTransactionCount += 1;
    }

    // 코드 분류: ST·OP는 같은 묶음으로 보고, 그 밖의 코드는 코드 자체를 분류로 써서 같은 이름의 다른
    // 자산유형(예: 비상장 주식 PS, 자산담보부증권 AB)을 한 항목으로 합치지 않는다.
    // 키는 원문 자산명과 코드 분류를 널문자로 이어 자산명에 구분자가 섞여도 겹치지 않게 한다.
    const typeClass =
      transaction.assetTypeCode === STOCK_ASSET_TYPE_CODE ||
      transaction.assetTypeCode === OPTION_ASSET_TYPE_CODE
        ? "ST-OP"
        : transaction.assetTypeCode;
    const key = `${transaction.asset}\u0000${typeClass}`;
    const existing = items.get(key);

    if (existing) {
      existing.assetTypeCodes.add(transaction.assetTypeCode);
      existing.transactionCount += 1;
      continue;
    }

    items.set(key, {
      key,
      asset: transaction.asset,
      assetTypeCodes: new Set([transaction.assetTypeCode]),
      // 티커 표기는 자산명 끝 괄호에서만 파생되므로 같은 항목의 모든 행에서 같은 값이 나온다.
      ticker: getHousePtrAssetTicker(
        transaction.asset,
        transaction.assetTypeCode,
      ),
      transactionCount: 1,
    });
  }

  const ordered: HousePtrActivityItem[] = Array.from(
    items.values(),
    (item) => ({
      key: item.key,
      asset: item.asset,
      assetTypeCodes: [...item.assetTypeCodes].sort(),
      ticker: item.ticker,
      transactionCount: item.transactionCount,
    }),
  ).sort(compareByCountThenKey);

  return {
    transactionCount: transactions.length,
    optionTransactionCount,
    items: ordered,
    maxTransactionCount: ordered[0]?.transactionCount ?? 0,
  };
}
