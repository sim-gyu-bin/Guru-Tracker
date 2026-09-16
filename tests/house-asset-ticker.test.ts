import assert from "node:assert/strict";
import test from "node:test";
import { getHousePtrAssetTicker } from "../src/domain/house";

/**
 * 원문 자산명 끝 괄호 표기를 티커로 옮기는 순수 함수의 경계를 검증한다.
 *
 * 저장된 `asset` 문자열(파서가 `[코드]`를 떼어 낸 값)만 입력으로 쓴다. 2026년 제출 20033725·20034836·
 * 20035143에서 관측한 원문 문자열 일부와, 같은 표기를 변형한 합성 문자열을 넣어 표기 추출이 원문을 벗어나거나
 * 없는 값을 만들어 내는 회귀를 잡는다. 네트워크·DB는 쓰지 않는다.
 */

test("원문 자산명 끝 괄호 표기만 티커로 옮기고 표기가 없으면 만들지 않는다", () => {
  const cases: readonly (readonly [string, string, string | null])[] = [
    // [원문 자산명, 자산유형 코드, 기대 티커]
    ["Bloom Energy Corporation Class A Common Stock (BE)", "ST", "BE"],
    ["Intel Corporation - Common Stock (INTC)", "OP", "INTC"],
    // 자산유형 코드가 달라도 원문 표기가 같으면 같은 티커를 준다(AB 유형 유닛 자산도 괄호 티커를 쓴다).
    ["AllianceBernstein Holding L.P. Units (AB)", "AB", "AB"],
    // 실제 티커와 철자가 겹칠 수 있는 회사·상품 약어도 원문 표기이므로 그대로 쓴다.
    ["Example Vehicle (FUND)", "ST", "FUND"],
    // 마지막 괄호만 보고 클래스 접미사는 떼지 않는다.
    ["Example Fund (Class A) Holdings (BE)", "ST", "BE"],
    ["Berkshire Hathaway Inc. (BRK.B)", "ST", "BRK.B"],
    // 표기가 없는 원문과 자산명 없는 문자열은 티커를 만들지 않는다.
    ["REOF XXV, LLC", "AB", null],
    ["", "ST", null],
    ["(BE)", "ST", null],
    // 티커 모양이 아닌 괄호는 값이 아니라 설명으로 본다.
    ["Example (aapl)", "ST", null],
    ["Example (2024)", "ST", null],
    ["Example (Class A)", "ST", null],
    ["Example (SHARES)", "ST", null],
  ];
  for (const [asset, assetTypeCode, expected] of cases)
    assert.equal(getHousePtrAssetTicker(asset, assetTypeCode), expected, asset);
});

test("비상장(PS)은 같은 원문이라도 티커를 주지 않는다", () => {
  // 공식 코드표에서 비상장을 명시한 PS는 표기가 있어도 상장 티커가 아니다.
  assert.equal(
    getHousePtrAssetTicker("Bloom Energy Corporation (BE)", "PS"),
    null,
  );
  assert.equal(
    getHousePtrAssetTicker("Bloom Energy Corporation (BE)", "ST"),
    "BE",
  );
});
