/**
 * Nancy Pelosi 화면이 쓰는 미국 하원 PTR(Periodic Transaction Report) 도메인 타입과 공식 코드 정의.
 *
 * 출처 제약:
 * - 값의 근거는 미국 하원 공식 공시(disclosures-clerk.house.gov)의 PTR 원문뿐이다. 제3자 요약이나 13F를 쓰지 않는다.
 * - 금액은 공식 원문의 거래금액 범위 문자열이며 정확한 금액·보유량·수익률·비중이 아니다. 합계·중간값을 계산하지 않는다.
 * - 거래유형·소유자·자산유형 코드는 원문 표기를 그대로 보존한다. 해석을 덧붙이는 매핑을 만들지 않는다.
 */

/** PTR 한 행(거래 1건). 자산명과 설명은 원문 문장을 줄 단위로 이어 붙인 표시용 문자열이다. */
export type HousePtrTransaction = {
  /** 자산명. 같은 자산이라도 원문에 적힌 문자열을 그대로 쓴다. */
  readonly asset: string;
  /** 공식 자산유형 코드(예: ST, OP, AB). 원문 자산명 끝 [코드]에서 분리한 값이다. */
  readonly assetTypeCode: string;
  /** 원문 거래유형 표기(P, S, S (partial), E) 그대로. */
  readonly transactionType: string;
  /** 거래일(YYYY-MM-DD). 원문 M/D/YYYY를 날짜로 정규화한다. */
  readonly transactionDate: string;
  /** 통지일(YYYY-MM-DD). 원문이 비어 있으면 null이며 화면에서는 빈 값으로 표시한다. */
  readonly notificationDate: string | null;
  /** 원문 거래금액 범위 문자열(예: "$250,001 - $500,000"). 숫자로 환산하지 않는다. */
  readonly amountRange: string;
  /** 소유자 코드. 공식 표기 SP/DC/JT 또는 기재가 없으면 빈 문자열이다. */
  readonly ownerCode: string;
  /** 원문 "F S:" 표기 값(예: New). 없으면 null. */
  readonly filingStatus: string | null;
  /**
   * 원문 설명 줄(D:/L:/C: 등)을 순서대로 보존한 목록.
   * 공식 접두는 그대로 두고 널문자 패딩만 공백 하나로 정규화한다(예: "D: Purchased 10,000 shares.", "L: US").
   * 접두를 떼어 내면 어떤 공시 항목인지 구분이 사라지므로 화면에서도 붙이거나 떼지 않는다.
   */
  readonly details: readonly string[];
};

/**
 * 최신 PTR 문서 1건을 그대로 담은 스냅샷. 여러 문서를 합치지 않으며 보유 목록이 아니다.
 * version은 DB가 부여하는 스냅샷 회전 번호다. 그 외 값은 전부 공식 원문에서 대조한 값만 들어온다.
 */
export type HousePtrSnapshot = {
  /** 하원 공식 문서번호 8자리. 색인 XML의 DocID이며 원문 PDF의 "Filing ID #"와 같아야 한다. */
  readonly documentId: string;
  /** 제출자 표기(원문 Name 값). 고정값과 다르면 수집 단계에서 실패한다. */
  readonly filerName: string;
  /** 신분 표기(원문 Status 값, 예: Member). */
  readonly filerStatus: string;
  /** 주/선거구(예: CA11). */
  readonly stateDistrict: string;
  /** 공식 제출일(YYYY-MM-DD). 색인 XML의 FilingDate. */
  readonly filingDate: string;
  /** 원문 서명 날짜(YYYY-MM-DD). 확인하지 못하면 null. */
  readonly signedAt: string | null;
  /** 하원 원문 PDF 주소. */
  readonly sourceUrl: string;
  /** 하원 색인 zip 주소(같은 연도의 FD.zip). */
  readonly indexUrl: string;
  readonly version: number;
  readonly transactions: readonly HousePtrTransaction[];
};

/** 화면이 표시하는 상태 묶음. 수집을 시작하지 않고 캐시만 읽는다. */
export type HousePtrView = {
  readonly snapshot: HousePtrSnapshot | null;
  readonly previousSnapshot: HousePtrSnapshot | null;
  /** ready=표시 가능, empty=아직 수집 전, error=확인 필요, unconfigured=서버 설정·스키마 준비 필요. */
  readonly status: "ready" | "empty" | "error" | "unconfigured";
  readonly lastAttemptAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastError: string | null;
  readonly syncing: boolean;
  readonly stale: boolean;
};

/** 원문 서명 줄과 대조하는 제출자 표기. 값이 다르면 다른 사람의 문서이므로 수집을 중단한다. */
export const HOUSE_PTR_FILER_NAME = "Hon. Nancy Pelosi";
/** 원문 Status 표기. 하원의원 신분을 확인하는 값이다. */
export const HOUSE_PTR_FILER_STATUS = "Member";

/** 공식 PTR 양식이 정의한 거래유형 4종. 이 밖의 표기는 원문 해석을 보장할 수 없어 실패로 처리한다. */
export const HOUSE_PTR_TRANSACTION_TYPES: Readonly<Record<string, true>> = {
  P: true,
  S: true,
  "S (partial)": true,
  E: true,
};
/** 공식 PTR 양식의 소유자 코드. 본인은 기재를 생략할 수 있어 빈 문자열을 허용한다. */
export const HOUSE_PTR_OWNER_CODES: Readonly<Record<string, true>> = {
  SP: true,
  DC: true,
  JT: true,
  "": true,
};

/**
 * 거래유형 코드→한국어 표기. 값의 근거는 하원 윤리위원회 Financial Disclosure Instruction Guide의
 * "you should indicate P (for purchase), S (for sale), or E (for an exchange)"와 "S (Partial)" 표기다.
 * 화면은 한국어와 원문 코드를 함께 보여 주며 원문 코드 없이 한국어만 쓰지 않는다.
 */
export const HOUSE_PTR_TRANSACTION_TYPE_LABELS: Readonly<
  Record<string, string>
> = {
  P: "매수",
  S: "매도",
  "S (partial)": "일부 매도",
  E: "교환",
};

/**
 * 소유자 코드→한국어 표기. 같은 Instruction Guide의 "an SP for spouse, DC for dependent child,
 * or JT for jointly held property"가 근거다. 본인 기재 생략(빈 문자열)은 라벨이 없으며 화면에서 "기재 없음"으로 표시한다.
 * 소유자는 자산 보유 주체이며 거래를 지시한 사람을 뜻하지 않는다.
 */
export const HOUSE_PTR_OWNER_CODE_LABELS: Readonly<Record<string, string>> = {
  SP: "배우자",
  DC: "부양 자녀",
  JT: "공동 보유",
};

/**
 * 하원 공식 자산유형 코드표(https://fd.house.gov/reference/asset-type-codes.aspx, 48개)의 코드→공식 명칭.
 * 표에 없는 코드가 원문에 나타나면 자산유형을 확정할 수 없으므로 수집 전체를 실패시킨다.
 */
export const HOUSE_PTR_ASSET_TYPE_LABELS: Readonly<Record<string, string>> = {
  "4K": "401K and Other Non-Federal Retirement Accounts",
  "5C": "529 College Savings Plan",
  "5F": "529 Portfolio",
  "5P": "529 Prepaid Tuition Plan",
  AB: "Asset-Backed Securities",
  BA: "Bank Accounts, Money Market Accounts and CDs",
  BK: "Brokerage Accounts",
  CO: "Collectibles",
  CS: "Corporate Securities (Bonds and Notes)",
  CT: "Cryptocurrency",
  DB: "Defined Benefit Pension",
  DO: "Debts Owed to the Filer",
  DS: "Delaware Statutory Trust",
  EF: "Exchange Traded Funds (ETF)",
  EQ: "Excepted/Qualified Blind Trust",
  ET: "Exchange Traded Notes",
  FA: "Farms",
  FE: "Foreign Exchange Position (Currency)",
  FN: "Fixed Annuity",
  FU: "Futures",
  GS: "Government Securities and Agency Debt",
  HE: "Hedge Funds & Private Equity Funds (EIF)",
  HN: "Hedge Funds & Private Equity Funds (non-EIF)",
  IC: "Investment Club",
  IH: "IRA (Held in Cash)",
  IP: "Intellectual Property & Royalties",
  IR: "IRA",
  MA: "Managed Accounts (e.g., SMA and UMA)",
  MF: "Mutual Funds",
  MO: "Mineral/Oil/Solar Energy Rights",
  OI: "Ownership Interest (Holding Investments)",
  OL: "Ownership Interest (Engaged in a Trade or Business)",
  OP: "Options",
  OT: "Other",
  PE: "Pensions",
  PM: "Precious Metals",
  PS: "Stock (Not Publicly Traded)",
  RE: "Real Estate Invest. Trust (REIT)",
  RF: "REIT (EIF)",
  RN: "REIT (non-EIF)",
  RP: "Real Property",
  RS: "Restricted Stock Units (RSUs)",
  SA: "Stock Appreciation Right",
  ST: "Stocks (including ADRs)",
  TR: "Trust",
  VA: "Variable Annuity",
  VI: "Variable Insurance",
  WU: "Whole/Universal Insurance",
};
