import Phaser from 'phaser';
import { deleteSave, hasSave } from '../core/save';
import { createNewGame } from '../core/state';
import { G, newGame, persist, sceneForPhase, setPlayClockRunning } from '../game';
import { isMaxLevelSimulation } from '../core/simulationMode';
import { drawStorefront } from '../ui/art';
import { play, setSoundEnabled, startMusic, stopMusic } from '../ui/sound';
import { Button, dialog, panel, toast, type DialogButton } from '../ui/widgets';
import { C, H, HEX, W, setEdgeColors, setupCamera, txt } from '../ui/theme';
import { currentAccount, deleteCurrentAccount, googleSignInErrorMessage, signInWithGoogle, signOutGoogle, type AccountUser } from '../services/auth';
import { chromeIntentUrl, detectInAppBrowser } from '../services/inAppBrowser';
import { cloudSaveEnabled, firebaseConfigured, hasAuthHint } from '../services/firebase';
import { getPendingConflict, onSyncStatus, resolveConflict, startSync, syncNow, type SyncStatus } from '../services/sync';
import { loadDiscarded, saveDiscarded } from '../services/cloudSave';
import { fetchMyRank, fetchTopLeaderboard } from '../services/leaderboard';
import { joinLiveShop } from '../services/liveShop';
import { applyOfflineIncome, offlineElapsed, offlineUnlocked, type OfflineReport } from '../core/offline';
import { formatMoney } from '../core/state';
import { getServerNow } from '../services/serverTime';
import { cacheGoogleAvatar } from '../ui/avatar';
import { checkForUpdate, manualCheckMessage } from '../ui/updateBanner';
import { openBackupMenu } from '../ui/backupCode';

const INTRO = [
  { icon: '👵', text: 'Cháu ơi, bà già rồi, đứng tiệm không nổi nữa...' },
  { icon: '🏪', text: 'Tiệm tạp hóa đầu hẻm này bà giao lại cho cháu. Bà để lại 500 nghìn làm vốn.' },
  { icon: '💪', text: 'Sáng nhập hàng, bày lên kệ rồi mở cửa bán. Nhớ thối tiền cho đúng nghen cháu!' },
];

export class TitleScene extends Phaser.Scene {
  private account: AccountUser | null = null;
  private syncStatus: SyncStatus = 'guest';
  private accountLabel?: Phaser.GameObjects.Text;
  private accountAvatarPlaceholder?: Phaser.GameObjects.Text;
  private accountAvatar?: Phaser.GameObjects.Image;
  private accountAvatarMask?: Phaser.GameObjects.Graphics;
  private accountAvatarTextureKey?: string;
  private accountAvatarPosition?: { x: number; y: number };
  private statusLabel?: Phaser.GameObjects.Text;
  private syncDot?: Phaser.GameObjects.Graphics;
  private syncMessage: string | null = null;
  private conflictOpen = false;
  private continuing = false;

  constructor() {
    super('Title');
  }

  create(data?: { login?: boolean }): void {
    setPlayClockRunning(false);
    this.conflictOpen = false;
    this.continuing = false;
    this.account = null;
    this.accountAvatar = undefined;
    this.accountAvatarMask = undefined;
    this.accountAvatarTextureKey = undefined;
    setupCamera(this);
    setEdgeColors('#eb6434', '#473b35');

    // Vẽ toàn bộ phối cảnh tiệm tạp hóa hoài niệm (bầu trời, mây trôi, ánh nắng, tiệm cổ xưa, dây đèn vàng, mèo tam thể, vỉa hè)
    const landscapeMenu = W > H;
    const storeX = landscapeMenu ? Math.round(W * 0.28) : W / 2;
    drawStorefront(this, storeX, 352, G.state.land.includes('D'));
    if (isMaxLevelSimulation) txt(this, storeX, 58, 'MÔ PHỎNG MAX LEVEL · SAVE RIÊNG', { size: 9, bold: true, color: '#fff2c8', origin: [0.5, 0.5] });

    // Nút Âm thanh nhanh góc trên bên trái
    const soundX = landscapeMenu ? 24 : 28;
    const soundY = landscapeMenu ? 20 : 22;
    const soundBtnG = this.add.graphics();
    soundBtnG.fillStyle(0x000000, 0.25).fillCircle(soundX, soundY + 1, 15);
    soundBtnG.fillStyle(0x3e2314, 1).fillCircle(soundX, soundY, 15);
    soundBtnG.lineStyle(1.5, 0xdfb475, 1).strokeCircle(soundX, soundY, 15);
    const soundIcon = txt(this, soundX, soundY, G.state.settings.sound ? '🔊' : '🔇', {
      size: 13,
      emoji: true,
      origin: [0.5, 0.5],
    });
    const soundZone = this.add.zone(soundX, soundY, 32, 32).setInteractive({ useHandCursor: true });
    soundZone.on('pointerup', () => {
      G.state.settings.sound = !G.state.settings.sound;
      setSoundEnabled(G.state.settings.sound);
      soundIcon.setText(G.state.settings.sound ? '🔊' : '🔇');
      if (hasSave()) persist();
    });

    // Nút Kiểm tra cập nhật cạnh nút âm thanh
    const updateX = landscapeMenu ? 58 : 66;
    const updateY = soundY;
    const updateBtnG = this.add.graphics();
    updateBtnG.fillStyle(0x000000, 0.25).fillCircle(updateX, updateY + 1, 15);
    updateBtnG.fillStyle(0x3e2314, 1).fillCircle(updateX, updateY, 15);
    updateBtnG.lineStyle(1.5, 0xdfb475, 1).strokeCircle(updateX, updateY, 15);
    txt(this, updateX, updateY, '🔄', { size: 13, emoji: true, origin: [0.5, 0.5] });
    let checkingUpdate = false;
    const updateZone = this.add.zone(updateX, updateY, 32, 32).setInteractive({ useHandCursor: true });
    updateZone.on('pointerup', () => {
      if (checkingUpdate) return;
      checkingUpdate = true;
      toast(this, 'Đang kiểm tra cập nhật…');
      void checkForUpdate().then((result) => {
        checkingUpdate = false;
        if (this.scene.isActive()) toast(this, manualCheckMessage(result));
      });
    });

    // Nút Mã sao lưu (xuất / nhập tiến trình để chuyển máy) cạnh nút cập nhật
    const backupX = landscapeMenu ? 92 : 104;
    const backupY = soundY;
    const backupBtnG = this.add.graphics();
    backupBtnG.fillStyle(0x000000, 0.25).fillCircle(backupX, backupY + 1, 15);
    backupBtnG.fillStyle(0x3e2314, 1).fillCircle(backupX, backupY, 15);
    backupBtnG.lineStyle(1.5, 0xdfb475, 1).strokeCircle(backupX, backupY, 15);
    txt(this, backupX, backupY, '💾', { size: 13, emoji: true, origin: [0.5, 0.5] });
    const backupZone = this.add.zone(backupX, backupY, 32, 32).setInteractive({ useHandCursor: true });
    backupZone.on('pointerup', () => openBackupMenu(this, () => this.scene.restart()));

    const saved = hasSave();
    const hasCloud = !isMaxLevelSimulation && cloudSaveEnabled();

    if (landscapeMenu) {
      // Bảng điều khiển gỗ gọn gàng, trang nhã bên phải trong chế độ ngang
      const rightAreaLeft = 352;
      const cardW = Math.min(276, Math.floor((W - rightAreaLeft - 16)));
      const cardH = hasCloud ? 306 : 288;
      const cardX = Math.round(rightAreaLeft + (W - rightAreaLeft) / 2);
      const cardY = Math.round((H - cardH) / 2);

      const cardG = this.add.graphics();
      // Bóng đổ
      cardG.fillStyle(0x000000, 0.35).fillRoundedRect(cardX - cardW / 2 + 2, cardY + 3, cardW, cardH, 12);
      // Nền gỗ sậm sang trọng
      cardG.fillStyle(0x2d1b11, 0.94).fillRoundedRect(cardX - cardW / 2, cardY, cardW, cardH, 12);
      // Viền kép chỉ vàng cổ điển
      cardG.lineStyle(1.5, 0xb88846, 0.85).strokeRoundedRect(cardX - cardW / 2 + 1, cardY + 1, cardW - 2, cardH - 2, 11);
      cardG.lineStyle(1, 0xe5c278, 0.3).strokeRoundedRect(cardX - cardW / 2 + 4, cardY + 4, cardW - 8, cardH - 8, 9);

      // 1. Khung tài khoản Google tích hợp bên trong bảng điều khiển (không nổi lơ lửng ngoài màn hình)
      if (hasCloud) {
        const accW = cardW - 24;
        const accH = 26;
        const accX = cardX;
        const accY = cardY + 18;

        const accG = this.add.graphics();
        accG.fillStyle(0x000000, 0.25).fillRoundedRect(accX - accW / 2, accY - accH / 2 + 1, accW, accH, 7);
        accG.fillStyle(0x1d1109, 0.92).fillRoundedRect(accX - accW / 2, accY - accH / 2, accW, accH, 7);
        accG.lineStyle(1.2, 0xb88846, 0.8).strokeRoundedRect(accX - accW / 2, accY - accH / 2, accW, accH, 7);

        const avatarX = accX - accW / 2 + 14;
        const avatarY = accY;
        accG.fillStyle(0x3e2314, 1).fillCircle(avatarX, avatarY, 9.5);
        accG.lineStyle(1, 0xdfb475, 1).strokeCircle(avatarX, avatarY, 9.5);
        this.accountAvatarPlaceholder = txt(this, avatarX, avatarY, 'G', { size: 11, bold: true, color: '#f2c94c', origin: [0.5, 0.5] });
        this.accountAvatarPosition = { x: avatarX, y: avatarY };

        this.accountLabel = txt(this, avatarX + 15, avatarY, 'Đăng nhập · Lưu đám mây', {
          size: 10,
          bold: true,
          color: '#fff4d6',
          origin: [0, 0.5],
        });

        this.syncDot = this.add.graphics({ x: accX + accW / 2 - 24, y: avatarY });
        this.updateSyncDot(this.syncStatus);

        txt(this, accX + accW / 2 - 10, avatarY - 1, '›', { size: 14, bold: true, color: '#dfb475', origin: [0.5, 0.5] });

        const accountBtn = this.add.zone(accX, accY, accW, accH).setInteractive({ useHandCursor: true });
        accountBtn.on('pointerup', () => { void this.openAccount(); });

        cardG.lineStyle(1, 0x5a3d28, 0.7).lineBetween(cardX - cardW / 2 + 16, cardY + 34, cardX + cardW / 2 - 16, cardY + 34);
      }

      // 2. Tiêu đề bảng điều khiển
      const titleY = hasCloud ? cardY + 48 : cardY + 18;
      const subY = hasCloud ? cardY + 62 : cardY + 33;
      const divY = hasCloud ? cardY + 72 : cardY + 45;

      txt(this, cardX, titleY, '🏪 TIỆM TẠP HÓA ĐẦU HẺM', {
        size: 12.5,
        bold: true,
        color: '#ffdf8d',
        origin: [0.5, 0.5],
      });
      const subText = saved
        ? `Ngày ${G.state.day} · Vốn ${formatMoney(G.state.money)}`
        : 'Khai trương tiệm mới · 500k làm vốn';
      txt(this, cardX, subY, subText, {
        size: 9.5,
        color: '#d9c2a7',
        origin: [0.5, 0.5],
      });
      // Vạch ngăn cách
      cardG.lineStyle(1, 0x5a3d28, 0.8).lineBetween(cardX - cardW / 2 + 16, divY, cardX + cardW / 2 - 16, divY);

      const btnW = cardW - 28;
      const toggleW = Math.floor((btnW - 8) / 2);

      const autoChangeColor = () => (G.state.settings.autoChange ? 0x2e7545 : 0x4e3322);
      const autoChangeStroke = () => (G.state.settings.autoChange ? 0x5ebd7c : 0x7c5840);
      const autoChangeLabel = () => (G.state.settings.autoChange ? '🧮 Thối: Bật' : '✋ Thối: Tắt');

      const autoScanColor = () => (G.state.settings.autoScan ? 0x2e7545 : 0x4e3322);
      const autoScanStroke = () => (G.state.settings.autoScan ? 0x5ebd7c : 0x7c5840);
      const autoScanLabel = () => (G.state.settings.autoScan ? '📦 Quét: Bật' : '🧺 Quét: Tắt');

      const offsetY = hasCloud ? 24 : 0;

      if (saved) {
        // 1. Chơi tiếp
        const continueBtn = new Button(this, cardX, cardY + 74 + offsetY, {
          w: btnW,
          h: 40,
          label: `▶   Chơi tiếp (Ngày ${G.state.day})`,
          color: 0x2e8b4e,
          stroke: 0x66cc8a,
          strokeAlpha: 0.65,
          size: 14,
          radius: 10,
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

        // 2. Chơi mới
        new Button(this, cardX, cardY + 120 + offsetY, {
          w: btnW,
          h: 34,
          label: '✨   Chơi mới',
          color: 0xc8562d,
          stroke: 0xf59871,
          strokeAlpha: 0.55,
          size: 13,
          radius: 9,
          onTap: () => this.askNewGame(saved),
        });

        // 3. Cách chơi
        new Button(this, cardX, cardY + 162 + offsetY, {
          w: btnW,
          h: 32,
          label: '📖   Cách chơi',
          color: 0x734828,
          stroke: 0xdfb475,
          strokeAlpha: 0.45,
          size: 12.5,
          radius: 9,
          onTap: () => this.scene.start('HowTo'),
        });

        // 4. Hai nút trợ giúp thối / quét
        const toggleY = cardY + 202 + offsetY;
        const autoBtn = new Button(this, cardX - toggleW / 2 - 4, toggleY, {
          w: toggleW,
          h: 28,
          label: autoChangeLabel(),
          color: autoChangeColor(),
          stroke: autoChangeStroke(),
          strokeAlpha: 0.6,
          size: 11,
          radius: 8,
          onTap: () => {
            G.state.settings.autoChange = !G.state.settings.autoChange;
            autoBtn.setText(autoChangeLabel());
            autoBtn.setStyle(autoChangeColor(), autoChangeStroke());
            persist();
          },
        });
        const scanBtn = new Button(this, cardX + toggleW / 2 + 4, toggleY, {
          w: toggleW,
          h: 28,
          label: autoScanLabel(),
          color: autoScanColor(),
          stroke: autoScanStroke(),
          strokeAlpha: 0.6,
          size: 11,
          radius: 8,
          onTap: () => {
            G.state.settings.autoScan = !G.state.settings.autoScan;
            scanBtn.setText(autoScanLabel());
            scanBtn.setStyle(autoScanColor(), autoScanStroke());
            persist();
          },
        });

        // 5. Bảng xếp hạng
        this.addLeaderboardButton(cardY + 240 + offsetY, cardX, true, btnW);
      } else {
        // Người chơi mới
        const startBtn = new Button(this, cardX, cardY + 80 + offsetY, {
          w: btnW,
          h: 44,
          label: '▶   Mở tiệm ngay',
          color: 0x2e8b4e,
          stroke: 0x66cc8a,
          strokeAlpha: 0.65,
          size: 15,
          radius: 10,
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

        new Button(this, cardX, cardY + 134 + offsetY, {
          w: btnW,
          h: 36,
          label: '📖   Cách chơi',
          color: 0x734828,
          stroke: 0xdfb475,
          strokeAlpha: 0.45,
          size: 13,
          radius: 9,
          onTap: () => this.scene.start('HowTo'),
        });

        const toggleY = cardY + 182 + offsetY;
        const autoBtn = new Button(this, cardX - toggleW / 2 - 4, toggleY, {
          w: toggleW,
          h: 28,
          label: autoChangeLabel(),
          color: autoChangeColor(),
          stroke: autoChangeStroke(),
          strokeAlpha: 0.6,
          size: 11,
          radius: 8,
          onTap: () => {
            G.state.settings.autoChange = !G.state.settings.autoChange;
            autoBtn.setText(autoChangeLabel());
            autoBtn.setStyle(autoChangeColor(), autoChangeStroke());
            persist();
          },
        });
        const scanBtn = new Button(this, cardX + toggleW / 2 + 4, toggleY, {
          w: toggleW,
          h: 28,
          label: autoScanLabel(),
          color: autoScanColor(),
          stroke: autoScanStroke(),
          strokeAlpha: 0.6,
          size: 11,
          radius: 8,
          onTap: () => {
            G.state.settings.autoScan = !G.state.settings.autoScan;
            scanBtn.setText(autoScanLabel());
            scanBtn.setStyle(autoScanColor(), autoScanStroke());
            persist();
          },
        });

        this.addLeaderboardButton(cardY + 224 + offsetY, cardX, true, btnW);
      }
    } else {
      // Chế độ dọc: Pill tài khoản Google ở góc trên bên phải
      if (hasCloud) {
        const pillW = 168;
        const pillH = 32;
        const pillR = 16;
        const pillX = W - 14 - pillW / 2;
        const pillY = soundY;

        const pillG = this.add.graphics();
        pillG.fillStyle(0x000000, 0.25).fillRoundedRect(pillX - pillW / 2, pillY - pillH / 2 + 1.5, pillW, pillH, pillR);
        pillG.fillStyle(0xfffaef, 1).fillRoundedRect(pillX - pillW / 2, pillY - pillH / 2, pillW, pillH, pillR);
        pillG.lineStyle(1.5, 0xdfb475, 1).strokeRoundedRect(pillX - pillW / 2, pillY - pillH / 2, pillW, pillH, pillR);

        // Icon tròn 'G'
        pillG.fillStyle(0xffffff, 1).fillCircle(pillX - pillW / 2 + 16, pillY, 11);
        pillG.lineStyle(1, 0xe5d8c5, 1).strokeCircle(pillX - pillW / 2 + 16, pillY, 11);
        this.accountAvatarPlaceholder = txt(this, pillX - pillW / 2 + 16, pillY, 'G', { size: 13, bold: true, color: '#4285f4', origin: [0.5, 0.5] });
        this.accountAvatarPosition = { x: pillX - pillW / 2 + 16, y: pillY };

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
      }
      const btnX = W / 2;
      const btnW = 268;
      const extraY = Math.max(0, (H - 640) * 0.9);
      const continueY = 388 + extraY;
      const newGameY = 444 + extraY;
      const howToY = 496 + extraY;
      const toggleYResponsive = 546 + extraY;
      const toggleCenterX = W / 2;
      const toggleGap = 69;
      const toggleWResponsive = 130;

      if (saved) {
        const continueBtn = new Button(this, btnX, continueY, {
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

        new Button(this, btnX, newGameY, {
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

        new Button(this, btnX, howToY, {
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

        const toggleW = toggleWResponsive;
        const toggleH = 36;
        const toggleY = toggleYResponsive;

        const autoChangeColor = () => (G.state.settings.autoChange ? 0x2e7545 : 0x4e3322);
        const autoChangeStroke = () => (G.state.settings.autoChange ? 0x5ebd7c : 0x7c5840);
        const autoChangeLabel = () => (G.state.settings.autoChange ? '🧮  Thối: Bật' : '✋  Thối: Tắt');

        const autoBtn = new Button(this, toggleCenterX - toggleGap, toggleY, {
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

        const scanBtn = new Button(this, toggleCenterX + toggleGap, toggleY, {
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

        this.addLeaderboardButton(toggleY + 44, W / 2, false);
      } else {
        const startBtn = new Button(this, btnX, 406 + extraY, {
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

        new Button(this, btnX, howToY, {
          w: btnW,
          h: 42,
          label: '📖   Cách chơi',
          color: 0x734828,
          stroke: 0xdfb475,
          strokeAlpha: 0.45,
          size: 15,
          radius: 11,
          onTap: () => this.scene.start('HowTo'),
        });

        const toggleW = toggleWResponsive;
        const toggleH = 36;
        const toggleY = toggleYResponsive;

        const autoChangeColor = () => (G.state.settings.autoChange ? 0x2e7545 : 0x4e3322);
        const autoChangeStroke = () => (G.state.settings.autoChange ? 0x5ebd7c : 0x7c5840);
        const autoChangeLabel = () => (G.state.settings.autoChange ? '🧮  Thối: Bật' : '✋  Thối: Tắt');

        const autoBtn = new Button(this, toggleCenterX - toggleGap, toggleY, {
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

        const scanBtn = new Button(this, toggleCenterX + toggleGap, toggleY, {
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

        this.addLeaderboardButton(toggleY + 44, W / 2, false);
      }
    }

    // Đăng ký lắng nghe trạng thái đồng bộ đám mây
    if (hasCloud) {
      const unsubscribeStatus = onSyncStatus((status, message) => {
        this.syncStatus = status;
        this.syncMessage = message ?? null;
        this.updateSyncDot(status);
        if (status === 'conflict') this.showConflict();
      });

      if (firebaseConfigured()) {
        void (async () => {
          await startSync();
          await this.refreshAccount();
        })();
      }

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribeStatus);
    }

    // Chân trang hoài niệm
    const version = import.meta.env.VITE_APP_VERSION ?? '0.1.0';
    const buildTime = import.meta.env.VITE_BUILD_TIME;
    txt(this, landscapeMenu ? storeX : W / 2, H - (landscapeMenu ? 14 : 24), `★  Tiệm Tạp Hóa Đầu Hẻm · v${version}${buildTime ? ` (${buildTime})` : ''}  ★`, {
      size: landscapeMenu ? 9.5 : 10,
      color: '#dfc7a8',
      origin: [0.5, 0.5],
    });

    if (G.loadError) {
      // Bản lưu từ phiên bản mới hơn: nhắc cập nhật thay vì gợi ý chơi mới (chơi mới sẽ ghi đè).
      const msg = G.loadError.includes('mới hơn') ? G.loadError : 'Bản lưu bị lỗi nên không đọc được.\nĐã giữ bản sao lưu, bạn có thể chơi mới.';
      toast(this, msg, H * 0.3, C.red);
      G.loadError = null;
    }
    if (data?.login && !isMaxLevelSimulation && cloudSaveEnabled()) this.time.delayedCall(150, () => { void this.openAccount(); });
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
      const landscapeMenu = W > H;
      if (this.account) {
        const rawName = this.account.displayName ?? 'Tài khoản';
        const maxLen = landscapeMenu ? 16 : 11;
        const shortName = rawName.length > maxLen ? rawName.slice(0, maxLen - 2) + '…' : rawName;
        this.accountLabel?.setText(shortName);
        void this.refreshAccountAvatar(this.account);
      } else {
        this.accountLabel?.setText(landscapeMenu ? 'Đăng nhập · Lưu đám mây' : 'Đăng nhập');
        this.clearAccountAvatar();
      }
      this.updateSyncDot(this.syncStatus);
    } catch {
      // Cloud setup errors are shown only when the player opens the account panel.
    }
  }

  private async refreshAccountAvatar(account: AccountUser): Promise<void> {
    const position = this.accountAvatarPosition;
    if (!position || !account.photoURL) return;
    const key = `google-avatar-${encodeURIComponent(account.uid)}`;
    if (!(await cacheGoogleAvatar(this, account.photoURL, key))) return;
    if (!this.scene.isActive() || this.account?.uid !== account.uid) return;
    this.clearAccountAvatar();
    this.accountAvatarTextureKey = key;
    const radius = W > H ? 9.5 : 11;
    this.accountAvatar = this.add.image(position.x, position.y, key).setDisplaySize(radius * 2, radius * 2);
    const maskShape = this.make.graphics({}, false).setPosition(position.x, position.y);
    maskShape.fillStyle(0xffffff, 1).fillCircle(0, 0, radius);
    this.accountAvatarMask = maskShape;
    this.accountAvatar.setMask(maskShape.createGeometryMask());
    this.accountAvatarPlaceholder?.setVisible(false);
  }

  private clearAccountAvatar(): void {
    this.accountAvatar?.destroy();
    this.accountAvatar = undefined;
    this.accountAvatarMask?.destroy();
    this.accountAvatarMask = undefined;
    this.accountAvatarTextureKey = undefined;
    this.accountAvatarPlaceholder?.setVisible(true);
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
      const message = googleSignInErrorMessage(error);
      if (message.startsWith('Bạn đã hủy')) toast(this, message);
      else dialog(this, { icon: '☁️', title: 'Chưa đăng nhập được', body: message, buttons: [{ label: 'Đóng', color: C.grey }] });
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
    dialog(this, { icon: '🌐', title: 'Mở game bằng trình duyệt', body: `Google không cho đăng nhập trong ${browserName}. Bấm ⋯ rồi chọn “Mở bằng trình duyệt”.`, buttons, illustration: 'open-browser' });
  }

  private showSignedInMenu(): void {
    const landscape = W > H;
    const modalW = landscape ? 460 : Math.min(320, W - 24);
    const backups = loadDiscarded();
    const modalH = landscape ? (backups.length ? 246 : 224) : (backups.length ? 370 : 336);
    const cx = W / 2;
    const cy = H / 2;

    const layer = this.add.container(0, 0).setDepth(2000);
    this.events.emit('thdh-hud-overlay', true);
    const close = () => {
      this.tweens.add({
        targets: layer,
        alpha: 0,
        duration: 120,
        onComplete: () => {
          this.events.emit('thdh-hud-overlay', false);
          layer.destroy();
        },
      });
    };

    // Nền tối mờ che màn hình, bấm ra ngoài để đóng
    const shade = this.add.rectangle(cx, cy, W, H, 0x000000, 0.6).setInteractive();
    shade.on('pointerup', close);
    layer.add(shade);

    // Bảng hộp thoại phong cách tiệm cổ
    const card = panel(this, cx - modalW / 2, cy - modalH / 2, modalW, modalH);
    layer.add(card);

    // Nút đóng '✕' góc trên bên phải
    const closeBtn = this.add.text(cx + modalW / 2 - 16, cy - modalH / 2 + 16, '✕', {
      fontFamily: 'sans-serif',
      fontSize: '15px',
      color: '#7c5840',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', close);
    layer.add(closeBtn);

    const account = this.account;
    const rawName = account?.displayName ?? 'Tài khoản Google';
    const email = account?.email ?? '';
    const lastSync = G.state.sync.lastSyncedAt ? new Date(G.state.sync.lastSyncedAt).toLocaleString('vi-VN') : 'Chưa có';
    const statusText = this.statusText(this.syncStatus, this.syncMessage ?? undefined);

    if (landscape) {
      // 1. Header ngang: Avatar tròn bên trái + Thông tin tài khoản ở giữa
      const avatarX = cx - modalW / 2 + 36;
      const avatarY = cy - modalH / 2 + 38;
      const avatarRadius = 18;

      if (this.accountAvatarTextureKey && this.textures.exists(this.accountAvatarTextureKey)) {
        const avatar = this.add.image(avatarX, avatarY, this.accountAvatarTextureKey).setDisplaySize(avatarRadius * 2, avatarRadius * 2);
        const mask = this.make.graphics({}, false).setPosition(avatarX, avatarY);
        mask.fillStyle(0xffffff, 1).fillCircle(0, 0, avatarRadius);
        avatar.setMask(mask.createGeometryMask());
        layer.add(avatar);
      } else {
        const bgCircle = this.add.graphics();
        bgCircle.fillStyle(0x3e2314, 1).fillCircle(avatarX, avatarY, avatarRadius);
        layer.add(bgCircle);
        layer.add(txt(this, avatarX, avatarY, rawName.charAt(0).toUpperCase() || 'G', { size: 14, bold: true, color: '#f2c94c', origin: [0.5, 0.5] }));
      }
      const ring = this.add.graphics();
      ring.lineStyle(1.8, 0xdfb475, 1).strokeCircle(avatarX, avatarY, avatarRadius);
      layer.add(ring);

      // Tên & email & trạng thái
      layer.add(txt(this, avatarX + 26, avatarY - 14, rawName, { size: 13.5, bold: true, color: HEX.ink, origin: [0, 0.5] }));
      layer.add(txt(this, avatarX + 26, avatarY + 1, email, { size: 9.5, color: HEX.muted, origin: [0, 0.5] }));

      // Chấm đồng bộ & thời gian
      const dotColor = this.syncStatus === 'synced' ? 0x388e3c : this.syncStatus === 'error' || this.syncStatus === 'conflict' ? 0xd32f2f : 0xf57c00;
      const dot = this.add.graphics();
      dot.fillStyle(dotColor, 1).fillCircle(avatarX + 30, avatarY + 15, 3.5);
      layer.add(dot);
      layer.add(txt(this, avatarX + 38, avatarY + 15, `${statusText} · Lần cuối: ${lastSync}`, { size: 9, color: '#4a3528', origin: [0, 0.5] }));

      // Vạch ngăn cách trang nhã
      const divY = cy - modalH / 2 + 68;
      const divG = this.add.graphics();
      divG.lineStyle(1, 0x5a3d28, 0.5).lineBetween(cx - modalW / 2 + 16, divY, cx + modalW / 2 - 16, divY);
      layer.add(divG);

      // 2. Lưới nút bấm cân đối: 2 cột rộng rãi
      const btnW = 196;
      const btnH = 32;
      const col1X = cx - btnW / 2 - 6;
      const col2X = cx + btnW / 2 + 6;

      const syncLabel = this.syncStatus === 'error' ? '🔄 Thử lại đồng bộ' : '☁️ Lưu ngay';

      // Hàng 1
      layer.add(new Button(this, col1X, divY + 24, {
        w: btnW, h: btnH, label: syncLabel, color: C.green, size: 12.5,
        onTap: () => { close(); void syncNow(true).then(() => toast(this, this.statusText(this.syncStatus, this.syncMessage ?? undefined))); },
      }));
      layer.add(new Button(this, col2X, divY + 24, {
        w: btnW, h: btnH, label: '🏆 Bảng xếp hạng', color: C.wood, size: 12.5,
        onTap: () => { close(); void this.showLeaderboard(); },
      }));

      // Hàng 2
      const backupBtn = backups.length ? {
        label: '📦 Khôi phục bản cũ', color: C.wood,
        onTap: () => { close(); this.confirmRestoreBackup(); },
      } : {
        label: '🔒 Quyền riêng tư', color: C.wood,
        onTap: () => { close(); window.open('./privacy.html', '_blank', 'noopener'); },
      };
      layer.add(new Button(this, col1X, divY + 62, {
        w: btnW, h: btnH, label: backupBtn.label, color: backupBtn.color, size: 12.5,
        onTap: backupBtn.onTap,
      }));
      layer.add(new Button(this, col2X, divY + 62, {
        w: btnW, h: btnH, label: '🚪 Đăng xuất', color: C.blue, size: 12.5,
        onTap: () => { close(); void this.signOut(); },
      }));

      // Hàng 3
      if (backups.length) {
        layer.add(new Button(this, col1X, divY + 100, {
          w: btnW, h: btnH, label: '🔒 Quyền riêng tư', color: C.wood, size: 12,
          onTap: () => { close(); window.open('./privacy.html', '_blank', 'noopener'); },
        }));
      }
      layer.add(new Button(this, backups.length ? col2X : col1X, divY + 100, {
        w: btnW, h: btnH, label: '🗑️ Xóa tài khoản', color: C.red, size: 12,
        onTap: () => { close(); this.confirmDeleteAccount(); },
      }));

      if (!backups.length) {
        layer.add(new Button(this, col2X, divY + 100, {
          w: btnW, h: btnH, label: '✕ Đóng', color: C.grey, size: 12,
          onTap: close,
        }));
      } else {
        layer.add(new Button(this, cx, divY + 138, {
          w: 160, h: 26, label: '✕ Đóng', color: C.grey, size: 11,
          onTap: close,
        }));
      }
    } else {
      // Chế độ dọc: Căn giữa avatar và danh sách nút xếp gọn
      const avatarY = cy - modalH / 2 + 36;
      const avatarRadius = 20;

      if (this.accountAvatarTextureKey && this.textures.exists(this.accountAvatarTextureKey)) {
        const avatar = this.add.image(cx, avatarY, this.accountAvatarTextureKey).setDisplaySize(avatarRadius * 2, avatarRadius * 2);
        const mask = this.make.graphics({}, false).setPosition(cx, avatarY);
        mask.fillStyle(0xffffff, 1).fillCircle(0, 0, avatarRadius);
        avatar.setMask(mask.createGeometryMask());
        layer.add(avatar);
      } else {
        const bgCircle = this.add.graphics();
        bgCircle.fillStyle(0x3e2314, 1).fillCircle(cx, avatarY, avatarRadius);
        layer.add(bgCircle);
        layer.add(txt(this, cx, avatarY, rawName.charAt(0).toUpperCase() || 'G', { size: 16, bold: true, color: '#f2c94c', origin: [0.5, 0.5] }));
      }
      const ring = this.add.graphics();
      ring.lineStyle(1.8, 0xdfb475, 1).strokeCircle(cx, avatarY, avatarRadius);
      layer.add(ring);

      layer.add(txt(this, cx, avatarY + 30, rawName, { size: 14, bold: true, color: HEX.ink, origin: [0.5, 0.5] }));
      layer.add(txt(this, cx, avatarY + 48, email, { size: 10, color: HEX.muted, origin: [0.5, 0.5] }));
      layer.add(txt(this, cx, avatarY + 64, `${statusText}\nLần cuối: ${lastSync}`, { size: 9.5, color: '#4a3528', origin: [0.5, 0.5], align: 'center' }));

      const divY = avatarY + 84;
      const divG = this.add.graphics();
      divG.lineStyle(1, 0x5a3d28, 0.5).lineBetween(cx - modalW / 2 + 16, divY, cx + modalW / 2 - 16, divY);
      layer.add(divG);

      const btnW = (modalW - 36) / 2;
      const btnH = 34;
      const col1X = cx - btnW / 2 - 4;
      const col2X = cx + btnW / 2 + 4;
      const syncLabel = this.syncStatus === 'error' ? 'Thử lại' : 'Lưu ngay';

      layer.add(new Button(this, col1X, divY + 24, {
        w: btnW, h: btnH, label: syncLabel, color: C.green, size: 12.5,
        onTap: () => { close(); void syncNow(true).then(() => toast(this, this.statusText(this.syncStatus, this.syncMessage ?? undefined))); },
      }));
      layer.add(new Button(this, col2X, divY + 24, {
        w: btnW, h: btnH, label: '🏆 Xếp hạng', color: C.wood, size: 12.5,
        onTap: () => { close(); void this.showLeaderboard(); },
      }));

      layer.add(new Button(this, col1X, divY + 64, {
        w: btnW, h: btnH, label: backups.length ? '📦 Bản cũ' : '🔒 Quyền riêng tư', color: C.wood, size: 12,
        onTap: () => { close(); if (backups.length) this.confirmRestoreBackup(); else window.open('./privacy.html', '_blank', 'noopener'); },
      }));
      layer.add(new Button(this, col2X, divY + 64, {
        w: btnW, h: btnH, label: '🚪 Đăng xuất', color: C.blue, size: 12.5,
        onTap: () => { close(); void this.signOut(); },
      }));

      layer.add(new Button(this, col1X, divY + 104, {
        w: btnW, h: btnH, label: backups.length ? '🔒 Quyền riêng tư' : '🗑️ Xóa nick', color: backups.length ? C.wood : C.red, size: 11.5,
        onTap: () => { close(); if (backups.length) window.open('./privacy.html', '_blank', 'noopener'); else this.confirmDeleteAccount(); },
      }));
      layer.add(new Button(this, col2X, divY + 104, {
        w: btnW, h: btnH, label: backups.length ? '🗑️ Xóa nick' : '✕ Đóng', color: backups.length ? C.red : C.grey, size: 11.5,
        onTap: () => { close(); if (backups.length) this.confirmDeleteAccount(); },
      }));

      if (backups.length) {
        layer.add(new Button(this, cx, divY + 142, {
          w: modalW - 28, h: 32, label: '✕ Đóng', color: C.grey, size: 12,
          onTap: close,
        }));
      }
    }

    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 140 });
  }

  private addLeaderboardButton(y: number, x = W / 2, compact = false, customW?: number): void {
    if (isMaxLevelSimulation || !cloudSaveEnabled()) return;
    new Button(this, x, y, {
      w: customW ?? (compact ? 180 : 268),
      h: compact ? 30 : 36,
      label: '🏆  Bảng xếp hạng',
      color: 0x9a6b16,
      stroke: 0xf2c65a,
      strokeAlpha: 0.6,
      size: 13,
      radius: 9,
      onTap: () => { void this.showLeaderboard(); },
    });
  }

  private async showLeaderboard(): Promise<void> {
    const uid = this.account?.uid;
    if (!uid) {
      dialog(this, {
        icon: '🏆',
        title: 'Bảng xếp hạng',
        body: 'Đăng nhập Google để xem bảng xếp hạng và so tài với người chơi khác.',
        buttons: [
          { label: 'Đăng nhập', color: C.green, onTap: () => { void this.openAccount(); } },
          { label: 'Đóng', color: C.grey },
        ],
      });
      return;
    }
    try {
      const [top, mine] = await Promise.all([fetchTopLeaderboard(10), fetchMyRank(uid)]);
      const inTop10 = top.some((e) => e.uid === uid);
      const lines = top.length
        ? top.map((e, i) => `${this.medalIcon(i + 1)} ${e.displayName} — ${formatMoney(e.money)} · Lv ${e.level}${e.uid === uid ? '  👈 bạn' : ''}`)
        : ['Chưa có ai trên bảng xếp hạng.'];
      if (mine && !inTop10) lines.push('···', `${this.medalIcon(mine.rank)} ${mine.entry.displayName} — ${formatMoney(mine.entry.money)} · Lv ${mine.entry.level}  👈 bạn`);
      const myStats = mine
        ? `\n\nThống kê của bạn:\nHạng #${mine.rank} · Lv ${mine.entry.level} · Ngày ${mine.entry.day}`
        : '\n\nBạn chưa có trong bảng xếp hạng. Hãy đồng bộ cloud ít nhất một lần để tham gia.';
      dialog(this, {
        icon: '🏆',
        title: 'Bảng xếp hạng',
        body: lines.join('\n') + myStats,
        buttons: [{ label: 'Đóng', color: C.grey }],
      });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'permission-denied') toast(this, 'Máy chủ chưa cho phép đọc bảng xếp hạng. Cần cập nhật quyền Firestore.');
      else toast(this, navigator.onLine ? 'Không tải được bảng xếp hạng.' : 'Không có mạng, chưa tải được bảng xếp hạng.');
    }
  }

  private medalIcon(rank: number): string {
    return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
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
      this.clearAccountAvatar();
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
      this.clearAccountAvatar();
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

  private async continueGame(): Promise<void> {
    if (this.continuing) return;
    if (G.liveSnapshot) {
      void this.joinSharedShop();
      return;
    }
    this.continuing = true;
    let now = Date.now();
    let serverElapsed: number | undefined;
    if (hasAuthHint() && G.state.lastSeen > 0) {
      try {
        now = await getServerNow();
        serverElapsed = now - G.state.lastSeen;
      } catch {
        // If offline, preserve local play by falling back to the saved device time.
      }
    }
    const elapsed = offlineElapsed(G.state, now, serverElapsed);
    const report = elapsed !== null && offlineUnlocked(G.state)
      ? applyOfflineIncome(G.state, elapsed)
      : null;
    // Save processed earnings. When less than one offline day elapsed, keep the
    // previous lastSeen so short absences accumulate instead of being discarded.
    if (report) persist();
    setPlayClockRunning(true);
    if (G.state.settings.sound) startMusic();
    if (report) {
      this.showOfflineReport(report);
      return;
    }
    this.scene.start(sceneForPhase());
  }

  private showOfflineReport(report: OfflineReport): void {
    const details = [
      `Bạn vắng mặt ${report.hours.toFixed(1)} giờ · tiệm tự vận hành ${report.days} ngày.`,
      `Doanh thu ${formatMoney(report.revenue)} · hàng nhập ${formatMoney(report.cogs)}.`,
      `Lương ${formatMoney(report.wages)} · điện ${formatMoney(report.electricity)}.`,
      `Lãi ròng ${formatMoney(report.profit)}.`,
      ...(report.outOfStockDay !== null ? [`Tiệm gần hết hàng từ ngày ${report.outOfStockDay}.`] : []),
      ...(Object.values(report.spoiled).some((qty) => qty > 0) ? [`Hàng hỏng: ${Object.values(report.spoiled).reduce((a, b) => a + b, 0)} món.`] : []),
    ].join('\n');
    dialog(this, {
      icon: '🌙',
      title: 'Trong lúc bạn vắng mặt…',
      body: details,
      buttons: [{ label: 'Vào tiệm', color: C.green, onTap: () => this.scene.start(sceneForPhase()) }],
    });
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
