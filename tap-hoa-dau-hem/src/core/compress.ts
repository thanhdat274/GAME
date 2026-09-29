/** Load compression code only when a cloud save is actually read or written. */
async function getLZString() {
  const module = await import('lz-string');
  return module.default;
}

type SaveWorkerRequest = { id: number; action: 'compress' | 'decompress'; payload: unknown };
type SaveWorkerResponse = { id: number; value?: unknown; error?: string };
type PendingWorkerRequest = { resolve: (value: unknown) => void; timer: ReturnType<typeof setTimeout> };

let saveWorker: Worker | null | undefined;
let workerUnavailable = false;
let nextWorkerRequestId = 1;
const workerRequests = new Map<number, PendingWorkerRequest>();

function reportSaveDuration(operation: 'nén' | 'giải nén', mode: 'worker' | 'fallback', startedAt: number, sizeChars: number): void {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('perf') !== '1') return;
  window.dispatchEvent(new CustomEvent('thdh-perf-operation', {
    detail: { name: operation, mode, durationMs: performance.now() - startedAt, sizeChars },
  }));
}

/**
 * Save JSON + LZ work can pause the UI on large saves. Run it off-thread in browsers,
 * while retaining the original async main-thread implementation for tests/older browsers.
 */
function runSaveWorker(action: SaveWorkerRequest['action'], payload: unknown): Promise<{ available: false } | { available: true; value: unknown }> {
  const forceFallback = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('save-worker') === '0';
  if (forceFallback || workerUnavailable || typeof Worker === 'undefined') return Promise.resolve({ available: false });
  try {
    if (!saveWorker) {
      saveWorker = new Worker(new URL('../workers/save.worker.ts', import.meta.url), { type: 'module', name: 'thdh-save' });
      saveWorker.onmessage = (event: MessageEvent<SaveWorkerResponse>) => {
        const pending = workerRequests.get(event.data.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        workerRequests.delete(event.data.id);
        if (event.data.error) pending.resolve(undefined);
        else pending.resolve(event.data.value);
      };
      saveWorker.onerror = () => {
        workerUnavailable = true;
        saveWorker?.terminate();
        saveWorker = null;
        for (const [id, pending] of workerRequests) {
          clearTimeout(pending.timer);
          pending.resolve(undefined);
          workerRequests.delete(id);
        }
      };
    }
    const id = nextWorkerRequestId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const pending = workerRequests.get(id);
        if (!pending) return;
        workerUnavailable = true;
        saveWorker?.terminate();
        saveWorker = null;
        for (const [requestId, request] of workerRequests) {
          clearTimeout(request.timer);
          request.resolve(undefined);
          workerRequests.delete(requestId);
        }
      }, 30_000);
      workerRequests.set(id, { resolve, timer });
      try {
        saveWorker!.postMessage({ id, action, payload } satisfies SaveWorkerRequest);
      } catch {
        clearTimeout(timer);
        workerRequests.delete(id);
        saveWorker?.terminate();
        saveWorker = null;
        workerUnavailable = true;
        resolve(undefined);
      }
    }).then((value) => value === undefined ? { available: false } : { available: true, value });
  } catch {
    workerUnavailable = true;
    saveWorker?.terminate();
    saveWorker = null;
    return Promise.resolve({ available: false });
  }
}

/** Nén một giá trị JSON (bản lưu) thành chuỗi UTF-16 an toàn cho Firestore. */
export async function compressSave(value: unknown): Promise<string> {
  const startedAt = performance.now();
  let mode: 'worker' | 'fallback' = 'fallback';
  let sizeChars = 0;
  try {
    const offThread = await runSaveWorker('compress', value);
    if (offThread.available && typeof offThread.value === 'string') {
      mode = 'worker';
      sizeChars = offThread.value.length;
      return offThread.value;
    }
    const LZString = await getLZString();
    const result = LZString.compressToUTF16(JSON.stringify(value));
    sizeChars = result.length;
    return result;
  } finally {
    reportSaveDuration('nén', mode, startedAt, sizeChars);
  }
}

/** Giải nén chuỗi từ `compressSave`; ném lỗi nếu dữ liệu hỏng. */
export async function decompressSave<T = unknown>(data: string): Promise<T> {
  if (typeof data !== 'string' || data.length === 0) throw new Error('Bản lưu nén rỗng');
  const startedAt = performance.now();
  let mode: 'worker' | 'fallback' = 'fallback';
  const sizeChars = data.length;
  try {
    const offThread = await runSaveWorker('decompress', data);
    if (offThread.available) {
      mode = 'worker';
      return offThread.value as T;
    }
    const LZString = await getLZString();
    const json = LZString.decompressFromUTF16(data);
    if (!json) throw new Error('Không giải nén được bản lưu');
    return JSON.parse(json) as T;
  } finally {
    reportSaveDuration('giải nén', mode, startedAt, sizeChars);
  }
}

/** Số byte khi mã hóa UTF-8 (Firestore tính kích thước chuỗi theo UTF-8). */
export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}
