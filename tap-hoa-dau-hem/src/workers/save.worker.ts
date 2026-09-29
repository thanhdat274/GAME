import { compressToUTF16, decompressFromUTF16 } from 'lz-string';

interface RequestMessage {
  id: number;
  action: 'compress' | 'decompress';
  payload: unknown;
}

interface ResponseMessage {
  id: number;
  value?: unknown;
  error?: string;
}

const workerScope = globalThis as unknown as {
  addEventListener: (type: 'message', listener: (event: MessageEvent<RequestMessage>) => void) => void;
  postMessage: (message: ResponseMessage) => void;
};

workerScope.addEventListener('message', (event) => {
  const { id, action, payload } = event.data;
  try {
    if (action === 'compress') {
      const json = JSON.stringify(payload);
      if (json === undefined) throw new Error('Không thể chuyển bản lưu thành JSON.');
      workerScope.postMessage({ id, value: compressToUTF16(json) });
      return;
    }
    if (typeof payload !== 'string' || payload.length === 0) throw new Error('Bản lưu nén rỗng');
    const json = decompressFromUTF16(payload);
    if (!json) throw new Error('Không giải nén được bản lưu');
    workerScope.postMessage({ id, value: JSON.parse(json) });
  } catch (error) {
    workerScope.postMessage({ id, error: error instanceof Error ? error.message : 'Không xử lý được bản lưu.' });
  }
});
