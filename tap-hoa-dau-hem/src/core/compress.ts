import LZString from 'lz-string';

/** Nén một giá trị JSON (bản lưu) thành chuỗi UTF-16 an toàn cho localStorage và Firestore. */
export function compressSave(value: unknown): string {
  return LZString.compressToUTF16(JSON.stringify(value));
}

/** Giải nén chuỗi từ `compressSave`; ném lỗi nếu dữ liệu hỏng. */
export function decompressSave<T = unknown>(data: string): T {
  if (typeof data !== 'string' || data.length === 0) throw new Error('Bản lưu nén rỗng');
  const json = LZString.decompressFromUTF16(data);
  if (!json) throw new Error('Không giải nén được bản lưu');
  return JSON.parse(json) as T;
}

/** Số byte khi mã hóa UTF-8 (Firestore tính kích thước chuỗi theo UTF-8). */
export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}
