import Phaser from 'phaser';
import { deleteSave, hasSave } from '../core/save';
import { createNewGame } from '../core/state';
import { G, newGame, persist, sceneForPhase, setPlayClockRunning } from '../game';
import { drawStorefront } from '../ui/art';
import { play, setSoundEnabled, startMusic, stopMusic } from '../ui/sound';
import { Button, dialog, toast, type DialogButton } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';
import { currentAccount, deleteCurrentAccount, signInWithGoogle, signOutGoogle, type AccountUser } from '../services/auth';
import { chromeIntentUrl, isInAppBrowser } from '../services/inAppBrowser';
import { cloudSaveEnabled, firebaseConfigured } from '../services/firebase';
import { getPendingConflict, onSyncStatus, resolveConflict, startSync, syncNow, type SyncStatus } from '../services/sync';
import { loadDiscarded, saveDiscarded } from '../services/cloudSave';

const INTRO = [
  { icon: '👵', text: 'Cháu ơi, bà già rồi, đứng tiệm không nổi nữa...' },
  { icon: '🏪', text: 'Tiệm tạp hóa đầu hẻm này bà giao lại cho cháu. Bà để lại 300 nghìn làm vốn.' },
  { icon: '💪', text: 'Sáng nhập hàng, bày lên kệ rồi mở cửa bán. Nhớ thối tiền cho đúng nghen cháu!' },
];

export class TitleScene extends Phaser.Scene {
  private account: AccountUser | null = null;
  private syncStatus: SyncStatus = 'guest';
  private accountLabel?: Phaser.GameObjects.Text;
  private statusLabel?: Phaser.GameObjects.Text;
  private conflictOpen = false;

  constructor() {
    super('Title');
  }

  create(data?: { login?: boolean }): void {
    setPlayClockRunning(false);
    this.account = null;
    setupCamera(this);
    const g = this.add.graphics();
    g.fillGradientStyle(0xf7a35c, 0xf7a35c, 0x6b3fa0, 0x6b3fa0, 1).fillRect(0, 0, W, 360);
    g.fillStyle(0xffe08a, 1).fillCircle(36, 44, 24);
    drawStorefront(this, W / 2, 360);
    txt(this, W / 2, 200, 'TẠP HÓA ĐẦU HẺM', { size: 22, bold: true, color: HEX.white, origin: [0.5, 0.5], stroke: '#7a1f15' });
    txt(this, W / 2, 60, 'Tạp Hóa\nĐầu Hẻm', {
      size: 40,
      bold: true,
      color: '#fff3d6',
      origin: [0.5, 0.5],
      align: 'center',
      stroke: '#5a2a12',
    });
    txt(this, W / 2, 122, 'Nhập hàng · Bày kệ · Bán hàng · Thối tiền', { size: 13, color: HEX.white, origin: [0.5, 0.5] });

    if (cloudSaveEnabled()) {
      this.accountLabel = txt(this, W / 2, 252, '☁️  Đăng nhập Google để lưu tiến trình', { size: 13, bold: true, color: HEX.white, origin: [0.5, 0.5] });
      const accountButton = this.add.zone(W / 2, 252, 300, 38).setInteractive({ useHandCursor: true });
      accountButton.on('pointerup', () => { void this.openAccount(); });
      this.statusLabel = txt(this, W / 2, 276, '', { size: 10, color: '#fff3d6', origin: [0.5, 0.5] });
      const unsubscribeStatus = onSyncStatus((status, message) => {
        this.syncStatus = status;
        this.statusLabel?.setText(message ? this.statusText(status, message) : this.statusText(status));
        if (status === 'conflict') this.showConflict();
      });
      if (firebaseConfigured()) {
        void startSync();
        void this.refreshAccount();
      }
      const onCloudLoaded = () => this.scene.restart();
      window.addEventListener('thdh-cloud-loaded', onCloudLoaded);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('thdh-cloud-loaded', onCloudLoaded));
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribeStatus);
    }

    const saved = hasSave();
    let y = saved ? 372 : 400;
    if (saved) {
      new Button(this, W / 2, y, {
        w: 240,
        h: 52,
        label: `▶  Chơi tiếp (Ngày ${G.state.day})`,
        color: C.green,
        size: 17,
        onTap: () => this.continueGame(),
      });
      y += 60;
    }
    new Button(this, W / 2, y, {
      w: 240,
      h: 48,
      label: '🆕  Chơi mới',
      color: saved ? C.blue : C.green,
      onTap: () => this.askNewGame(saved),
    });
    y += 56;
    new Button(this, W / 2, y, { w: 240, h: 44, label: '📖  Cách chơi', color: C.wood, onTap: () => this.scene.start('HowTo') });
    y += 52;
    const sound = new Button(this, W / 2, y, {
      w: 240,
      h: 40,
      label: this.soundLabel(),
      color: C.woodDark,
      size: 14,
      onTap: () => {
        G.state.settings.sound = !G.state.settings.sound;
        setSoundEnabled(G.state.settings.sound);
        sound.setText(this.soundLabel());
        if (saved) persist();
      },
    });
    y += 48;
    const autoLabel = () => (G.state.settings.autoChange ? '🧮  Tự thối tiền: Bật' : '✋  Tự thối tiền: Tắt');
    const auto = new Button(this, W / 2, y, {
      w: 240,
      h: 40,
      label: autoLabel(),
      color: C.woodDark,
      size: 14,
      onTap: () => {
        G.state.settings.autoChange = !G.state.settings.autoChange;
        auto.setText(autoLabel());
        if (saved) persist();
      },
    });
    txt(this, W / 2, H - 12, 'Phiên bản 0.1 · Giai đoạn 1', { size: 10, color: '#d8c3a0', origin: [0.5, 1] });

    if (G.loadError) {
      toast(this, 'Bản lưu bị lỗi nên không đọc được.\nĐã giữ bản sao lưu, bạn có thể chơi mới.', H * 0.3, C.red);
      G.loadError = null;
    }
    if (data?.login && cloudSaveEnabled()) this.time.delayedCall(150, () => { void this.openAccount(); });
  }

  private statusText(status: SyncStatus, detail?: string): string {
    if (detail && status === 'error') return `Đồng bộ lỗi: ${detail}`;
    return ({ guest: 'Chơi khách · tiến trình lưu trên máy', syncing: 'Đang đồng bộ…', synced: 'Đã đồng bộ', pending: 'Chưa đồng bộ · sẽ thử lại khi có mạng', error: 'Đồng bộ lỗi · chạm để thử lại', conflict: 'Hai bản lưu cần bạn chọn' })[status];
  }

  private async refreshAccount(): Promise<void> {
    try {
      this.account = await currentAccount();
      this.accountLabel?.setText(this.account ? `☁️  ${this.account.displayName ?? 'Tài khoản Google'}` : '☁️  Đăng nhập Google để lưu tiến trình');
    } catch {
      // Cloud setup errors are shown only when the player opens the account panel.
    }
  }

  private async openAccount(): Promise<void> {
    if (this.syncStatus === 'error') {
      await syncNow(true);
      return;
    }
    if (this.account) {
      this.showSignedInMenu();
      return;
    }
    if (isInAppBrowser()) {
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
    const buttons: DialogButton[] = [
      { label: 'Sao chép link', color: C.blue, onTap: () => {
        void navigator.clipboard?.writeText(location.href).then(() => toast(this, 'Đã sao chép link'));
      } },
    ];
    const intent = chromeIntentUrl();
    if (intent) buttons.push({ label: 'Mở bằng Chrome', color: C.green, onTap: () => { location.href = intent; } });
    buttons.push({ label: 'Tiếp tục chơi khách', color: C.grey });
    dialog(this, { icon: '🌐', title: 'Mở game bằng trình duyệt', body: 'Google không cho đăng nhập trong trình duyệt Facebook, Messenger, Zalo hoặc Instagram. Bấm ⋯ rồi chọn “Mở bằng trình duyệt”.', buttons });
  }

  private showSignedInMenu(): void {
    const buttons: DialogButton[] = [
      { label: 'Lưu ngay', color: C.green, onTap: () => { void syncNow(true).then(() => toast(this, 'Đã gửi yêu cầu đồng bộ')); } },
      { label: 'Đăng xuất', color: C.blue, onTap: () => { void this.signOut(); } },
      { label: 'Xóa tài khoản', color: C.red, onTap: () => this.confirmDeleteAccount() },
      { label: 'Đóng', color: C.grey },
    ];
    const backups = loadDiscarded();
    if (backups.length) buttons.splice(2, 0, { label: 'Khôi phục bản cũ', color: C.wood, onTap: () => this.confirmRestoreBackup() });
    buttons.splice(buttons.length - 1, 0, { label: 'Quyền riêng tư', color: C.wood, onTap: () => { window.open('./privacy.html', '_blank', 'noopener'); } });
    dialog(this, { icon: '☁️', title: this.account?.displayName ?? 'Tài khoản Google', body: `${this.account?.email ?? ''}\n${this.statusText(this.syncStatus)}`, buttons });
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
      this.accountLabel?.setText('☁️  Đăng nhập Google để lưu tiến trình');
      this.statusLabel?.setText(this.statusText('guest'));
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
      this.accountLabel?.setText('☁️  Đăng nhập Google để lưu tiến trình');
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
    if (!cloud) return;
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
        void resolveConflict(choice).finally(() => { this.conflictOpen = false; });
      } },
    ] });
  }

  private soundLabel(): string {
    return G.state.settings.sound ? '🔊  Âm thanh: Bật' : '🔇  Âm thanh: Tắt';
  }

  private continueGame(): void {
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
