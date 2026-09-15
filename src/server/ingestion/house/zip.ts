import { inflateRawSync } from "node:zlib";

/** 중앙 디렉터리 끝(EOCD) 시그니처. */
const END_OF_CENTRAL = 0x06054b50;
/** 중앙 디렉터리 항목 시그니처. */
const CENTRAL_ENTRY = 0x02014b50;
/** 로컬 파일 헤더 시그니처. */
const LOCAL_ENTRY = 0x04034b50;
/** EOCD는 최대 22바이트 + 주석 65535바이트다. 뒤에서부터 이 범위만 훑는다. */
const EOCD_WINDOW = 22 + 0xffff;
/** 항목 수 상한. 하원 색인은 2천 건 안팎이며 이를 크게 넘으면 우리가 아는 파일이 아니다. */
const MAX_ENTRIES = 4096;

function invalid(): never {
  throw new Error("HOUSE_VALIDATION");
}

/**
 * ZIP 아카이브에서 이름이 정확히 일치하는 항목 하나를 읽는다.
 * 입력: 아카이브 바이트, 항목 이름(예: 2026FD.xml), 항목 크기 한도.
 * 출력: 압축을 푼 항목 바이트. 해당 이름이 없으면 null(수집기가 원문 구성 변경으로 판단한다).
 * 불변 조건: 압축을 푼 크기가 중앙 디렉터리에 기록된 크기와 같아야 한다.
 * 실패 조건: 암호화·ZIP64·다중 디스크·미지원 압축 방식·손상된 구조·한도 초과 → HOUSE_VALIDATION.
 *
 * 반환 타입을 `Uint8Array<ArrayBuffer>`로 좁힌다. 이 바이트는 그대로 Storage 업로드 body가 되는데
 * `BodyInit`이 ArrayBuffer를 가진 뷰만 받기 때문이다.
 */
export function readZipEntry(
  archive: Uint8Array<ArrayBuffer>,
  name: string,
  limit: number,
): Uint8Array<ArrayBuffer> | null {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const length = archive.byteLength;
  const target = Buffer.from(name, "utf8");
  let eocd = -1;
  for (
    let offset = length - 22;
    offset >= Math.max(0, length - EOCD_WINDOW);
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) invalid();
  // 주석 길이가 파일 끝과 맞아야 진짜 EOCD다. 압축 데이터 안의 우연한 일치를 걸러낸다.
  if (eocd + 22 + view.getUint16(eocd + 20, true) !== length) invalid();
  if (
    view.getUint16(eocd + 4, true) !== 0 ||
    view.getUint16(eocd + 6, true) !== 0
  )
    invalid();
  const entries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (
    entries === 0xffff ||
    entries === 0 ||
    entries > MAX_ENTRIES ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff ||
    directoryOffset + directorySize > length
  ) {
    invalid();
  }
  let offset = directoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > length) invalid();
    if (view.getUint32(offset, true) !== CENTRAL_ENTRY) invalid();
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if (offset + 46 + nameLength > length) invalid();
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      invalid();
    }
    const matches =
      nameLength === target.byteLength &&
      target.equals(archive.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!matches) continue;
    // 암호화(비트 0)·강한 암호화(비트 6) 항목은 공식 색인에 없다.
    if ((flags & 0x1) !== 0 || (flags & 0x40) !== 0) invalid();
    if (compressedSize > limit || uncompressedSize > limit) invalid();
    if (localOffset + 30 > length) invalid();
    if (view.getUint32(localOffset, true) !== LOCAL_ENTRY) invalid();
    const localName = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    // 로컬 헤더 이름이 중앙 디렉터리 이름과 다르면 구조가 어긋난 파일이다.
    if (localName !== nameLength) invalid();
    if (
      !target.equals(
        archive.subarray(localOffset + 30, localOffset + 30 + localName),
      )
    ) {
      invalid();
    }
    const start = localOffset + 30 + localName + localExtra;
    if (start + compressedSize > length) invalid();
    const payload = archive.subarray(start, start + compressedSize);
    // 0은 무압축, 8은 deflate다. 그 밖의 방식은 공식 색인에 쓰이지 않는다.
    if (method === 0) {
      if (compressedSize !== uncompressedSize) invalid();
      return payload;
    }
    if (method !== 8) invalid();
    const inflated = inflateRawSync(payload);
    if (inflated.byteLength !== uncompressedSize) invalid();
    // Node의 Buffer는 언제나 ArrayBuffer 위에 있지만 타입은 ArrayBufferLike로 넓게 선언된다.
    // 복사하지 않고 같은 메모리를 보는 ArrayBuffer 뷰로 다시 만들어 반환 타입을 맞춘다.
    return new Uint8Array(
      inflated.buffer as ArrayBuffer,
      inflated.byteOffset,
      inflated.byteLength,
    );
  }
  return null;
}
