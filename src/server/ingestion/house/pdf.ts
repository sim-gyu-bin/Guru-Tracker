import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { HousePtrTextItem } from "./parse";

/** PTR 원문은 1~3페이지다. 이보다 긴 문서는 우리가 아는 서식이 아니므로 표시하지 않고 실패시킨다. */
const MAX_PAGES = 30;

function invalid(): never {
  throw new Error("HOUSE_VALIDATION");
}

/**
 * 공식 PTR PDF의 텍스트 조각을 페이지별 좌표와 함께 읽는다.
 * 입력: PDF 원문 바이트. 출력: 페이지 순서의 텍스트 조각 배열.
 * 불변 조건: 호출자가 넘긴 바이트를 변형하지 않는다. pdfjs는 넘겨받은 TypedArray의 버퍼를 워커로
 *   넘기며 원본을 비우므로(detach) 복사본을 넘겨야 한다. 해시 계산과 원문 보관은 호출자가 원본
 *   바이트로 수행한다.
 * 실패 조건: 복호화 실패·손상·페이지 수 초과 → HOUSE_VALIDATION.
 */
export async function extractHousePtrPages(
  bytes: Uint8Array,
): Promise<HousePtrTextItem[][]> {
  const task = getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    // PDF에 내장된 스크립트를 실행하지 않는다. 텍스트 추출에 필요하지 않다.
    isEvalSupported: false,
    verbosity: 0,
  });
  try {
    const document = await task.promise;
    if (document.numPages === 0 || document.numPages > MAX_PAGES) invalid();
    const pages: HousePtrTextItem[][] = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const items: HousePtrTextItem[] = [];
      for (const item of content.items) {
        // marked content 등 텍스트가 아닌 항목에는 좌표가 없다.
        if (!("str" in item)) continue;
        items.push({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
        });
      }
      pages.push(items);
      page.cleanup();
    }
    return pages;
  } catch {
    // 손상·암호화된 PDF는 좌표를 만들 수 없다. 접근 문제가 아니라 원문 서식 문제로 알린다.
    invalid();
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
