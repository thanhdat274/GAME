import Phaser from 'phaser';
import { deleteSave, hasSave } from '../core/save';
import { createNewGame } from '../core/state';
import { G, newGame, persist, sceneForPhase, setPlayClockRunning } from '../game';
import { drawStorefront } from '../ui/art';
import { play, setSoundEnabled, startMusic, stopMusic } from '../ui/sound';
import { Button, dialog, toast, type DialogButton } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';
import { currentAccount, deleteCurrentAccount, signInWithGoogle, signOutGoogle, type AccountUser } from '../services/auth';
import { chromeIntentUrl, detectInAppBrowser } from '../services/inAppBrowser';
import { cloudSaveEnabled, firebaseConfigured } from '../services/firebase';
import { getPendingConflict, onSyncStatus, resolveConflict, startSync, syncNow, type SyncStatus } from '../services/sync';
import { loadDiscarded, saveDiscarded } from '../services/cloudSave';
import { joinLiveShop, liveShopEnabled } from '../services/liveShop';

const INTRO = [
  { icon: '👵', text: 'Cháu ơi, bà già rồi, đứng tiệm không nổi nữa...' },
  { icon: '🏪', text: 'Tiệm tạp hóa đầu hẻm này bà giao lại cho cháu. Bà để lại 500 nghìn làm vốn.' },
  { icon: '💪', text: 'Sáng nhập hàng, bày lên kệ rồi mở cửa bán. Nhớ thối tiền cho đúng nghen cháu!' },
];

export class TitleScene extends Phaser.Scene {
  private account: AccountUser | null = null;
  private syncStatus: SyncStatus = 'guest';
  private accountLabel?: Phaser.GameObjects.Text;
  private statusLabel?: Phaser.GameObjects.Text;
  private syncDot?: Phaser.GameObjects.Graphics;
  private syncMessage: string | null = null;
  private conflictOpen = false;

  constructor() {
    super('Title');
  }

  create(data?: { login?: boolean }): void {
    setPlayClockRunning(false);
    this.conflictOpen = false;
    this.account = null;
    setupCamera(this);

    // Vẽ toàn bộ phối cảnh tiệm tạp hóa hoài niệm (bầu trời, mây trôi, ánh nắng, tiệm cổ xưa, dây đèn vàng, mèo tam thể, vỉa hè)
    drawStorefront(this, W / 2, 352);

    // Nút Âm thanh nhanh góc trên bên trái
    const soundBtnG = this.add.graphics();
    soundBtnG.fillStyle(0x000000, 0.25).fillCircle(28, 23, 16);
    soundBtnG.fillStyle(0x3e2314, 1).fillCircle(28, 22, 16);
    soundBtnG.lineStyle(1.5, 0xdfb475, 1).strokeCircle(28, 22, 16);
    const soundIcon = txt(this, 28, 22, G.state.settings.sound ? '🔊' : '🔇', {
      size: 14,
      emoji: true,
      origin: [0.5, 0.5],
    });
    const soundZone = this.add.zone(28, 22, 34, 34).setInteractive({ useHandCursor: true });
    soundZone.on('pointerup', () => {
      G.state.settings.sound = !G.state.settings.sound;
      setSoundEnabled(G.state.settings.sound);
      soundIcon.setText(G.state.settings.sound ? '🔊' : '🔇');
      if (hasSave()) persist();
    });

    // Pill tài khoản Google góc trên bên phải
    if (cloudSaveEnabled()) {
      const pillW = 168;
      const pillH = 32;
      const pillR = 16;
      const pillX = W - 14 - pillW / 2;
      const pillY = 22;

      const pillG = this.add.graphics();
      pillG.fillStyle(0x000000, 0.25).fillRoundedRect(pillX - pillW / 2, pillY - pillH / 2 + 1.5, pillW, pillH, pillR);
      pillG.fillStyle(0xfffaef, 1).fillRoundedRect(pillX - pillW / 2, pillY - pillH / 2, pillW, pillH, pillR);
      pillG.lineStyle(1.5, 0xdfb475, 1).strokeRoundedRect(pillX - pillW / 2, pillY - pillH / 2, pillW, pillH, pillR);

      // Icon tròn 'G'
      pillG.fillStyle(0xffffff, 1).fillCircle(pillX - pillW / 2 + 16, pillY, 11);
      pillG.lineStyle(1, 0xe5d8c5, 1).strokeCircle(pillX - pillW / 2 + 16, pillY, 11);
      txt(this, pillX - pillW / 2 + 16, pillY, 'G', { size: 13, bold: true, color: '#4285f4', origin: [0.5, 0.5] });

      this.accountLabel = txt(this, pillX - pillW / 2 + 32, pillY, 'Đăng nhập', {
        size: 11,
        bold: true,
        color: HEX.ink,
        origin: [0, 0.5],
      });

      // Chấm tròn trạng thái sync
      this.syncDot = this.add.graphics({ x: pillX + pillW / 2 - 25, y: pillY });
      this.updateSyncDot(this.syncStatus);

      // Mũi tên ›
      txt(this, pillX + pillW / 2 - 12, pillY - 1, '›', { size: 15, bold: true, color: HEX.muted, origin: [0.5, 0.5] });

      const accountBtn = this.add.zone(pillX, pillY, pillW, pillH).setInteractive({ useHandCursor: true });
      accountBtn.on('pointerup', () => { void this.openAccount(); });

      const unsubscribeStatus = onSyncStatus((status, message) => {
        this.syncStatus = status;
        this.syncMessage = message ?? null;
        this.updateSyncDot(status);
        if (status === 'conflict') this.showConflict();
      });

      if (firebaseConfigured()) {
        void startSync();
        void this.refreshAccount();
      }

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribeStatus);
    }

    // Các nút chức năng chính trên vỉa hè
    const saved = hasSave();
    const btnW = 268;

    if (saved) {
      // 1. Nút Chơi tiếp (chính, nổi bật có hiệu ứng nhịp thở nhẹ)
      const continueBtn = new Button(this, W / 2, 388, {
        w: btnW,
        h: 48,
        label: `▶   Chơi tiếp (Ngày ${G.state.day})`,
        color: 0x2e8b4e,
        stroke: 0x66cc8a,
        strokeAlpha: 0.65,
        size: 16,
        radius: 12,
        onTap: () => this.continueGame(),
      });
      this.tweens.add({
        targets: continueBtn,
        scale: 1.025,
        duration: 950,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      // 2. Nút Chơi mới (cam gạch retro)
      new Button(this, W / 2, 444, {
        w: btnW,
        h: 42,
        label: '✨   Chơi mới',
        color: 0xc8562d,
        stroke: 0xf59871,
        strokeAlpha: 0.55,
        size: 15,
        radius: 11,
        onTap: () => this.askNewGame(saved),
      });

      // 3. Nút Cách chơi (nâu gỗ ấm)
      new Button(this, W / 2, 496, {
        w: btnW,
        h: 38,
        label: '📖   Cách chơi',
        color: 0x734828,
        stroke: 0xdfb475,
        strokeAlpha: 0.45,
        size: 14,
        radius: 10,
        onTap: () => this.scene.start('HowTo'),
      });

      // 4. Hàng Cài đặt trợ giúp tiện ích (2 nút đặt song song ngang nhau)
      const toggleW = 130;
      const toggleH = 36;
      const toggleY = 546;

      const autoChangeColor = () => (G.state.settings.autoChange ? 0x2e7545 : 0x4e3322);
      const autoChangeStroke = () => (G.state.settings.autoChange ? 0x5ebd7c : 0x7c5840);
      const autoChangeLabel = () => (G.state.settings.autoChange ? '🧮  Thối: Bật' : '✋  Thối: Tắt');

      const autoBtn = new Button(this, W / 2 - 69, toggleY, {
        w: toggleW,
        h: toggleH,
        label: autoChangeLabel(),
        color: autoChangeColor(),
        stroke: autoChangeStroke(),
        strokeAlpha: 0.6,
        size: 12.5,
        radius: 9,
        onTap: () => {
          G.state.settings.autoChange = !G.state.settings.autoChange;
          autoBtn.setText(autoChangeLabel());
          autoBtn.setStyle(autoChangeColor(), autoChangeStroke());
          persist();
        },
      });

      const autoScanColor = () => (G.state.settings.autoScan ? 0x2e7545 : 0x4e3322);
      const autoScanStroke = () => (G.state.settings.autoScan ? 0x5ebd7c : 0x7c5840);
      const autoScanLabel = () => (G.state.settings.autoScan ? '📦  Quét: Bật' : '🧺  Quét: Tắt');

      const scanBtn = new Button(this, W / 2 + 69, toggleY, {
        w: toggleW,
        h: toggleH,
        label: autoScanLabel(),
        color: autoScanColor(),
        stroke: autoScanStroke(),
        strokeAlpha: 0.6,
        size: 12.5,
        radius: 9,
        onTap: () => {
          G.state.settings.autoScan = !G.state.settings.autoScan;
          scanBtn.setText(autoScanLabel());
          scanBtn.setStyle(autoScanColor(), autoScanStroke());
          persist();
        },
      });
    } else {
      // Khi chưa có file lưu (người chơi mới)
      const startBtn = new Button(this, W / 2, 406, {
        w: btnW,
        h: 50,
        label: '▶   Mở tiệm ngay',
        color: 0x2e8b4e,
        stroke: 0x66cc8a,
        strokeAlpha: 0.65,
        size: 17,
        radius: 12,
        onTap: () => this.startNew(),
      });
      this.tweens.add({
        targets: startBtn,
        scale: 1.025,
        duration: 950,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      new Button(this, W / 2, 468, {
        w: btnW,
        h: 44,
        label: '📖   Cách chơi',
        color: 0x734828,
        stroke: 0xdfb475,
        strokeAlpha: 0.45,
        size: 15,
        radius: 11,
        onTap: () => this.scene.start('HowTo'),
      });

      const toggleW = 130;
      const toggleH = 38;
      const toggleY = 530;

      const autoChangeColor = () => (G.state.settings.autoChange ? 0x2e7545 : 0x4e3322);
      const autoChangeStroke = () => (G.state.settings.autoChange ? 0x5ebd7c : 0x7c5840);
      const autoChangeLabel = () => (G.state.settings.autoChange ? '🧮  Thối: Bật' : '✋  Thối: Tắt');

      const autoBtn = new Button(this, W / 2 - 69, toggleY, {
        w: toggleW,
        h: toggleH,
        label: autoChangeLabel(),
        color: autoChangeColor(),
        stroke: autoChangeStroke(),
        strokeAlpha: 0.6,
        size: 12.5,
        radius: 9,
        onTap: () => {
          G.state.settings.autoChange = !G.state.settings.autoChange;
          autoBtn.setText(autoChangeLabel());
          autoBtn.setStyle(autoChangeColor(), autoChangeStroke());
          persist();
        },
      });

      const autoScanColor = () => (G.state.settings.autoScan ? 0x2e7545 : 0x4e3322);
      const autoScanStroke = () => (G.state.settings.autoScan ? 0x5ebd7c : 0x7c5840);
      const autoScanLabel = () => (G.state.settings.autoScan ? '📦  Quét: Bật' : '🧺  Quét: Tắt');

      const scanBtn = new Button(this, W / 2 + 69, toggleY, {
        w: toggleW,
        h: toggleH,
        label: autoScanLabel(),
        color: autoScanColor(),
        stroke: autoScanStroke(),
        strokeAlpha: 0.6,
        size: 12.5,
        radius: 9,
        onTap: () => {
          G.state.settings.autoScan = !G.state.settings.autoScan;
          scanBtn.setText(autoScanLabel());
          scanBtn.setStyle(autoScanColor(), autoScanStroke());
          persist();
        },
      });
    }

    // Chân trang hoài niệm
    txt(this, W / 2, 614, '★  Tiệm Tạp Hóa Đầu Hẻm · Phiên bản 0.1  ★', {
      size: 10,
      color: '#dfc7a8',
      origin: [0.5, 0.5],
    });

    if (G.loadError) {
      toast(this, 'Bản lưu bị lỗi nên không đọc được.\nĐã giữ bản sao lưu, bạn có thể chơi mới.', H * 0.3, C.red);
      G.loadError = null;
    }
    if (data?.login && cloudSaveEnabled()) this.time.delayedCall(150, () => { void this.openAccount(); });
  }

  private updateSyncDot(status: SyncStatus): void {
    if (!this.syncDot) return;
    this.syncDot.clear();
    const color = status === 'synced' ? 0x388e3c : status === 'error' || status === 'conflict' ? 0xd32f2f : 0xf57c00;
    this.syncDot.fillStyle(color, 1).fillCircle(0, 0, 4);
    this.syncDot.lineStyle(1, 0xffffff, 0.8).strokeCircle(0, 0, 4);
  }

  private statusText(status: SyncStatus, detail?: string): string {
    if (detail && status === 'error') return `Đồng bộ lỗi: ${detail}`;
    return ({ guest: 'Chơi khách · tiến trình lưu trên máy', syncing: 'Đang đồng bộ…', synced: 'Đã đồng bộ', pending: 'Chưa đồng bộ · sẽ thử lại khi có mạng', error: 'Đồng bộ lỗi · chạm để thử lại', conflict: 'Hai bản lưu cần bạn chọn' })[status];
  }

  private async refreshAccount(): Promise<void> {
    try {
      this.account = await currentAccount();
      if (this.account) {
        const rawName = this.account.displayName ?? 'Tài khoản';
        const shortName = rawName.length > 11 ? rawName.slice(0, 9) + '…' : rawName;
        this.accountLabel?.setText(shortName);
      } else {
        this.accountLabel?.setText('Đăng nhập');
      }
      this.updateSyncDot(this.syncStatus);
    } catch {
      // Cloud setup errors are shown only when the player opens the account panel.
    }
  }

  private async openAccount(): Promise<void> {
    if (this.account) {
      this.showSignedInMenu();
      return;
    }
    if (detectInAppBrowser(navigator.userAgent)) {
      this.showInAppGuide();
      return;
    }
    try {
      await signInWithGoogle();
      await this.refreshAccount();
      await startSync();
      this.statusLabel?.setText(this.statusText('syncing'));
    } catch (error) {
      dialog(this, { icon: '☁️', title: 'Chưa đăng nhập được', body: error instanceof Error ? error.message : 'Có lỗi khi đăng nhập Google.', buttons: [{ label: 'Đóng', color: C.grey }] });
    }
  }

  private showInAppGuide(): void {
    const browserName = detectInAppBrowser(navigator.userAgent) ?? 'ứng dụng này';
    const buttons: DialogButton[] = [
      { label: 'Sao chép link', color: C.blue, onTap: () => {
        const write = navigator.clipboard?.writeText(location.href);
        if (!write) {
          toast(this, 'Không sao chép được. Hãy mở menu ⋯ của ứng dụng.');
          return;
        }
        void write.then(() => toast(this, 'Đã sao chép link'))
          .catch(() => toast(this, 'Không sao chép được. Hãy mở menu ⋯ của ứng dụng.'));
      } },
    ];
    const intent = chromeIntentUrl();
    if (intent) buttons.push({ label: 'Mở bằng Chrome', color: C.green, onTap: () => { location.href = intent; } });
    buttons.push({ label: 'Tiếp tục chơi khách', color: C.grey });
    dialog(this, { icon: '🌐', title: 'Mở game bằng trình duyệt', body: `Google không cho đăng nhập trong ${browserName}. Bấm ⋯ rồi chọn “Mở bằng trình duyệt”.`, buttons });
  }

  private showSignedInMenu(): void {
    const buttons: DialogButton[] = [
      { label: this.syncStatus === 'error' ? 'Thử lại đồng bộ' : 'Lưu ngay', color: C.green, onTap: () => { void syncNow(true).then(() => toast(this, this.statusText(this.syncStatus, this.syncMessage ?? undefined))); } },
      ...(liveShopEnabled() ? [{ label: '🤝 Chơi chung trên hai máy', color: C.blue, onTap: () => { void this.joinSharedShop(); } } as DialogButton] : []),
      { label: 'Đăng xuất', color: C.blue, onTap: () => { void this.signOut(); } },
      { label: 'Xóa tài khoản', color: C.red, onTap: () => this.confirmDeleteAccount() },
      { label: 'Đóng', color: C.grey },
    ];
    const backups = loadDiscarded();
    if (backups.length) buttons.splice(2, 0, { label: 'Khôi phục bản cũ', color: C.wood, onTap: () => this.confirmRestoreBackup() });
    buttons.splice(buttons.length - 1, 0, { label: 'Quyền riêng tư', color: C.wood, onTap: () => { window.open('./privacy.html', '_blank', 'noopener'); } });
    const lastSync = G.state.sync.lastSyncedAt ? new Date(G.state.sync.lastSyncedAt).toLocaleString('vi-VN') : 'Chưa có';
    dialog(this, { icon: '☁️', title: this.account?.displayName ?? 'Tài khoản Google', body: `${this.account?.email ?? ''}\n${this.statusText(this.syncStatus, this.syncMessage ?? undefined)}\nLần đồng bộ cuối: ${lastSync}`, buttons });
  }

  private async joinSharedShop(): Promise<void> {
    try {
      if (!G.liveSnapshot) {
        if (getPendingConflict()) {
          this.showConflict();
          return;
        }
        if (G.state.sync.dirty) {
          await syncNow(true);
          if (G.state.sync.dirty || this.syncStatus === 'conflict') {
            toast(this, 'Đồng bộ hoặc xử lý xung đột trước khi mở phiên chung.');
            return;
          }
        }
      }
      await joinLiveShop();
      setPlayClockRunning(true);
      if (G.state.settings.sound) startMusic();
      this.scene.start(sceneForPhase());
    } catch (error) {
      dialog(this, { icon: '🤝', title: 'Phiên chung chưa mở', body: error instanceof Error ? error.message : 'Không kết nối được phiên chung.', buttons: [{ label: 'Đóng', color: C.grey }] });
    }
  }

  private confirmRestoreBackup(): void {
    const backup = loadDiscarded()[0];
    if (!backup) {
      toast(this, 'Không còn bản lưu nào để khôi phục.');
      return;
    }
    dialog(this, { title: 'Khôi phục bản lưu?', body: `Ngày ${backup.state.day} · Lv ${backup.state.level}. Tiến trình hiện tại sẽ được giữ thành bản lưu bị bỏ.`, buttons: [
      { label: 'Hủy', color: C.grey },
      { label: 'Khôi phục', color: C.green, onTap: () => {
        void saveDiscarded(G.state).then(() => {
          G.state = backup.state;
          G.state.sync.dirty = true;
          persist();
          this.scene.restart();
        });
      } },
    ] });
  }

  private async signOut(): Promise<void> {
    if (G.state.sync.dirty) {
      await syncNow(true);
      if (G.state.sync.dirty) {
        dialog(this, { title: 'Chưa đồng bộ', body: 'Tiến trình gần nhất chưa lên cloud. Bạn vẫn muốn đăng xuất?', buttons: [
          { label: 'Hủy', color: C.grey },
          { label: 'Vẫn đăng xuất', color: C.red, onTap: () => { void this.finishSignOut(); } },
        ] });
        return;
      }
    }
    await this.finishSignOut();
  }

  private async finishSignOut(): Promise<void> {
    try {
      await signOutGoogle();
      this.account = null;
      this.accountLabel?.setText('Đăng nhập');
      this.updateSyncDot('guest');
    } catch (error) {
      toast(this, error instanceof Error ? error.message : 'Không đăng xuất được.');
    }
  }

  private confirmDeleteAccount(): void {
    dialog(this, { icon: '⚠️', title: 'Xóa tài khoản và cloud?', body: 'Tiến trình trên Firebase và tài khoản Google liên kết sẽ bị xóa. Bản trên máy vẫn được giữ.', buttons: [
      { label: 'Hủy', color: C.grey },
      { label: 'Tiếp tục', color: C.red, onTap: () => dialog(this, { title: 'Xác nhận lần cuối', body: 'Không thể khôi phục dữ liệu cloud sau khi xóa.', buttons: [
        { label: 'Quay lại', color: C.grey },
        { label: 'Xóa', color: C.red, onTap: () => { void this.deleteAccount(); } },
      ] }) },
    ] });
  }

  private async deleteAccount(): Promise<void> {
    try {
      await deleteCurrentAccount();
      this.account = null;
      this.accountLabel?.setText('Đăng nhập');
      this.updateSyncDot('guest');
      dialog(this, { title: 'Đã xóa dữ liệu cloud', body: 'Bạn có muốn xóa luôn bản lưu trên máy này không?', buttons: [
        { label: 'Giữ trên máy', color: C.blue },
        { label: 'Xóa trên máy', color: C.red, onTap: () => {
          deleteSave();
          G.state = createNewGame();
          this.scene.restart();
        } },
      ] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không xóa được tài khoản.';
      dialog(this, { title: 'Không xóa được', body: message.includes('recent-login') ? 'Google cần xác nhận đăng nhập gần đây. Hãy đăng nhập lại rồi thử xóa lần nữa.' : message, buttons: [{ label: 'Đóng', color: C.grey }] });
    }
  }

  private showConflict(): void {
    if (this.conflictOpen) return;
    const cloud = getPendingConflict();
    if (!cloud) {
      if (this.syncStatus !== 'conflict') return;
      this.conflictOpen = true;
      dialog(this, { title: 'Bản cloud đã bị xóa', body: 'Tiến trình trên máy vẫn còn. Bạn có muốn lưu lại bản này lên cloud?', buttons: [
        { label: 'Để sau', color: C.grey, onTap: () => { this.conflictOpen = false; } },
        { label: 'Giữ trên máy', color: C.green, onTap: () => this.confirmConflict('local') },
      ] });
      return;
    }
    this.conflictOpen = true;
    const local = G.state.summary;
    const describe = (name: string, value: { level: number; day: number; money: number; playSeconds: number }) => `${name}\nLv ${value.level} · Ngày ${value.day} · ${value.money.toLocaleString('vi-VN')}đ · ${Math.floor(value.playSeconds / 60)} phút`;
    const cloudFirst = cloud.summary.playSeconds > local.playSeconds;
    const first = cloudFirst ? 'cloud' : 'local';
    dialog(this, { icon: '⚠️', title: 'Chọn tiến trình', body: `${cloudFirst ? '🏅 Tiến trình xa hơn: cloud' : '🏅 Tiến trình xa hơn: trên máy'}\n\n${describe('Trên máy này', local)}\n\n${describe('Trên cloud', cloud.summary)}`, buttons: [
      { label: 'Giữ trên máy', color: first === 'local' ? C.green : C.blue, onTap: () => this.confirmConflict('local') },
      { label: 'Dùng cloud', color: first === 'cloud' ? C.green : C.blue, onTap: () => this.confirmConflict('cloud') },
    ] });
  }

  private confirmConflict(choice: 'local' | 'cloud'): void {
    dialog(this, { title: 'Xác nhận chọn bản', body: choice === 'local' ? 'Bản lưu cloud hiện tại sẽ được thay bằng tiến trình trên máy.' : 'Tiến trình trên máy sẽ được lưu làm bản có thể khôi phục trong 7 ngày.', buttons: [
      { label: 'Quay lại', color: C.grey, onTap: () => { this.conflictOpen = false; this.showConflict(); } },
      { label: 'Xác nhận', color: C.red, onTap: () => {
        void resolveConflict(choice).finally(() => {
          this.conflictOpen = false;
          if (this.syncStatus === 'conflict') this.showConflict();
          else if (this.syncStatus === 'error') toast(this, this.syncMessage ?? 'Không chọn được bản lưu.');
        });
      } },
    ] });
  }

  private continueGame(): void {
    if (G.liveSnapshot) {
      void this.joinSharedShop();
      return;
    }
    setPlayClockRunning(true);
    if (G.state.settings.sound) startMusic();
    this.scene.start(sceneForPhase());
  }

  private askNewGame(saved: boolean): void {
    if (!saved) {
      this.startNew();
      return;
    }
    dialog(this, {
      icon: '⚠️',
      title: 'Chơi lại từ đầu?',
      body: `Tiến trình hiện tại (Ngày ${G.state.day}, Lv ${G.state.level}) sẽ bị xóa.`,
      buttons: [
        { label: 'Hủy', color: C.grey },
        { label: 'Đồng ý', color: C.red, onTap: () => this.startNew() },
      ],
    });
  }

  private startNew(): void {
    newGame();
    setPlayClockRunning(true);
    stopMusic();
    if (G.state.settings.sound) startMusic();
    this.showIntro(0);
  }

  private showIntro(i: number): void {
    if (i >= INTRO.length) {
      G.state.seenIntro = true;
      persist();
      this.scene.start('Morning');
      return;
    }
    play('tap');
    dialog(this, {
      icon: INTRO[i].icon,
      title: i === 0 ? 'Thư của bà' : undefined,
      body: INTRO[i].text,
      buttons: [{ label: i === INTRO.length - 1 ? 'Mở tiệm thôi!' : 'Tiếp ›', onTap: () => this.showIntro(i + 1) }],
    });
  }
}
