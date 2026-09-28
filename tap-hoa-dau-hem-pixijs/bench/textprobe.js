/*
 * Đo vị trí điểm ảnh thật của chữ mẫu trên canvas (dùng chung cho Phaser và PixiJS + ECS).
 * Trả về hàng/cột đầu tiên và cuối cùng có điểm ảnh tối trong vùng quanh chữ (theo điểm ảnh canvas).
 */
(function () {
  window.thdhTextProbe = async function (cases) {
    const g = window.thdh.game;
    for (const s of g.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused()) g.scene.stop(s.sys.settings.key);
    let time = performance.now();
    const step = () => { time += 1000 / 60; g.step(time, 1000 / 60); };
    step();
    g.scene.start('HowTo');
    for (let i = 0; i < 5; i++) step();
    const sc = g.scene.getScene('HowTo');
    const cover = sc.add.rectangle(180, 320, 360, 2000, 0xffffff, 1).setDepth(10000);
    const gl = g.renderer.gl;
    const out = [];
    for (const c of cases) {
      const t = sc.add.text(c.x, c.y, c.text, { fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', fontSize: `${c.size}px`, fontStyle: c.bold ? 'bold' : 'normal', color: '#000000', padding: { top: 2, bottom: 2 }, resolution: 2 }).setOrigin(c.ox ?? 0, c.oy ?? 0).setDepth(10001);
      step();
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let top = -1, bottom = -1, left = W, right = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = ((H - 1 - y) * W + x) * 4;
          if (px[i] < 128) { if (top < 0) top = y; bottom = y; left = Math.min(left, x); right = Math.max(right, x); }
        }
      }
      out.push({ text: c.text, size: c.size, top, bottom, left, right, w: t.width, h: t.height });
      t.destroy();
    }
    cover.destroy();
    return out;
  };
})();
