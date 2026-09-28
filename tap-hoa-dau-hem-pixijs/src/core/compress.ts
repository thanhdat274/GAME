/** Load compression code only when a cloud save is actually read or written. */
async function getLZString() {
  const module = await import('lz-string');
  return module.default;
}

/** Nén một giá trị JSON (bản lưu) thành chuỗi UTF-16 an toàn cho Firestore. */
export async function compressSave(value: unknown): Promise<string> {
  const LZString = await getLZString();
  return LZString.compressToUTF16(JSON.stringify(value));
}

/** Giải nén chuỗi từ `compressSave`; ném lỗi nếu dữ liệu hỏng. */
export async function decompressSave<T = unknown>(data: string): Promise<T> {
  if (typeof data !== 'string' || data.length === 0) throw new Error('Bản lưu nén rỗng');
  const LZString = await getLZString();
  const json = LZString.decompressFromUTF16(data);
  if (!json) throw new Error('Không giải nén được bản lưu');
  return JSON.parse(json) as T;
}

/** Số byte khi mã hóa UTF-8 (Firestore tính kích thước chuỗi theo UTF-8). */
export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}
