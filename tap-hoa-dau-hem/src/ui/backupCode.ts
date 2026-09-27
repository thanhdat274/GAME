import type Phaser from 'phaser';
import { exportBackupCode, importBackupCode } from '../core/save';
import { formatMoney } from '../core/state';
import { G, persist } from '../game';
import { C, FONT, H } from './theme';
import { dialog, toast } from './widgets';

/** Xuất / nhập mã sao lưu: phương án chuyển máy khi không đăng nhập Google. `onImported` chạy sau khi đã ghi đè tiến trình. */
export function openBackupMenu(scene: Phaser.Scene, onImported: () => void): void {
  dialog(scene, { icon: '💾', title: 'Mã sao lưu', body: 'Xuất mã để chép tiến trình sang máy khác, hoặc dán mã từ máy cũ.', buttons: [
    { label: '📤 Xuất mã', color: C.green, onTap: () => { void exportCode(scene); } },
    { label: '📥 Nhập mã', color: C.blue, onTap: () => importCode(scene, onImported) },
    { label: 'Đóng', color: C.grey },
  ] });
}

async function exportCode(scene: Phaser.Scene): Promise<void> {
  persist();
  const code = await exportBackupCode(G.state);
  try {
    await navigator.clipboard.writeText(code);
    toast(scene, `Đã sao chép mã (${code.length} ký tự).\nDán vào ô "Nhập mã" trên máy mới.`, H * 0.3, C.greenDark);
  } catch {
    // Trình duyệt chặn clipboard: hiện mã trong ô để người chơi tự chọn và chép.
    codeBox({ title: 'Sao chép mã sao lưu', hint: 'Nhấn giữ vào ô, chọn tất cả rồi sao chép.', value: code, okLabel: 'Xong' });
  }
}

function importCode(scene: Phaser.Scene, onImported: () => void): void {
  codeBox({ title: 'Nhập mã sao lưu', hint: 'Dán mã đã xuất từ máy cũ vào ô dưới đây.', okLabel: 'Nhập', cancelLabel: 'Hủy', onOk: (code) => applyCode(scene, code, onImported) });
}

const CSS = `
.thdh-code{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font-family:${FONT}}
.thdh-code__box{width:min(320px,88vw);box-sizing:border-box;padding:18px 16px 16px;background:#fff6e6;border:2px solid #e0c9a0;border-radius:10px;box-shadow:0 4px 0 rgba(26,18,11,.35);color:#3b2a1f;text-align:center}
.thdh-code__icon{font-size:36px;line-height:1}
.thdh-code__title{margin:8px 0 4px;font-size:19px;font-weight:700}
.thdh-code__hint{margin:0 0 10px;font-size:14px;color:#7a6552}
.thdh-code__area{width:100%;height:110px;box-sizing:border-box;padding:8px;border:1.5px solid #d9bf94;border-radius:8px;background:#fdf3df;color:#3b2a1f;font:12px/1.35 ui-monospace,Consolas,monospace;resize:none;word-break:break-all}
.thdh-code__area:focus{outline:none;border-color:#8b5a2b}
.thdh-code__err{min-height:18px;margin:6px 0 2px;font-size:13px;font-weight:700;color:#d84a3a}
.thdh-code__row{display:flex;gap:10px}
.thdh-code__btn{flex:1;height:44px;border:0;border-radius:8px;font:700 15px ${FONT};color:#fff;cursor:pointer;box-shadow:0 3px 0 rgba(0,0,0,.25)}
.thdh-code__btn:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.25)}
.thdh-code__btn--ok{background:#3aa35b}.thdh-code__btn--cancel{background:#9e9e9e}
`;

/** Popup HTML có ô nhập (canvas Phaser không có ô gõ/dán chữ), vẽ theo màu hộp thoại của game. */
function codeBox(o: { title: string; hint: string; value?: string; okLabel: string; cancelLabel?: string; onOk?: (code: string) => Promise<string | null> | void }): void {
  if (!document.getElementById('thdh-code-css')) {
    const style = document.createElement('style');
    style.id = 'thdh-code-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const root = document.createElement('div');
  root.className = 'thdh-code';
  root.innerHTML = `<div class="thdh-code__box" role="dialog" aria-modal="true">
    <div class="thdh-code__icon">💾</div>
    <div class="thdh-code__title"></div>
    <p class="thdh-code__hint"></p>
    <textarea class="thdh-code__area" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
    <div class="thdh-code__err"></div>
    <div class="thdh-code__row"></div>
  </div>`;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  q('.thdh-code__title').textContent = o.title;
  q('.thdh-code__hint').textContent = o.hint;
  const area = q<HTMLTextAreaElement>('.thdh-code__area');
  const err = q('.thdh-code__err');
  const row = q('.thdh-code__row');
  if (o.value !== undefined) {
    area.value = o.value;
    area.readOnly = true;
  } else {
    area.placeholder = 'THDH1:…';
  }
  const close = () => root.remove();
  const button = (label: string, kind: 'ok' | 'cancel', onTap: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `thdh-code__btn thdh-code__btn--${kind}`;
    b.textContent = label;
    b.addEventListener('click', onTap);
    row.appendChild(b);
    return b;
  };
  if (o.cancelLabel) button(o.cancelLabel, 'cancel', close);
  const ok = button(o.okLabel, 'ok', () => {
    if (!o.onOk) { close(); return; }
    const code = area.value.trim();
    if (!code) { err.textContent = 'Chưa dán mã.'; return; }
    ok.disabled = true;
    void Promise.resolve(o.onOk(code)).then((message) => {
      ok.disabled = false;
      if (message) err.textContent = message;
      else close();
    });
  });
  area.addEventListener('input', () => { err.textContent = ''; });
  document.body.appendChild(root);
  if (o.value !== undefined) area.select();
  else area.focus();
}

/** Trả về thông báo lỗi để hiện ngay trong popup, hoặc null khi mã hợp lệ (popup đóng, chuyển sang bước xác nhận). */
function applyCode(scene: Phaser.Scene, code: string, onImported: () => void): Promise<string | null> {
  return importBackupCode(code).then((state) => {
    dialog(scene, { icon: '⚠️', title: 'Ghi đè tiến trình?', body: `Mã: Ngày ${state.day} · Lv ${state.level} · ${formatMoney(state.money)}.\nTiến trình hiện tại (Ngày ${G.state.day}, Lv ${G.state.level}) sẽ bị thay.`, buttons: [
      { label: 'Hủy', color: C.grey },
      { label: 'Ghi đè', color: C.red, onTap: () => {
        state.sync = { ...G.state.sync, dirty: true };
        G.state = state;
        persist();
        onImported();
      } },
    ] });
    return null;
  }).catch((error: unknown) => (error instanceof Error ? error.message : 'Mã không hợp lệ.'));
}
