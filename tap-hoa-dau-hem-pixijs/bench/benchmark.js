/*
 * Benchmark dùng chung cho bản Phaser gốc và bản PixiJS + ECS.
 *
 * Cách dùng (dán vào DevTools console của từng bản, cùng máy, cùng kích thước cửa sổ):
 *   1. Mở bản PixiJS với ?simulate=max&reset=1 rồi chạy:   copy(JSON.stringify(thdh.G.state))
 *   2. Dán nội dung file này vào console của MỖI bản, rồi chạy:
 *        await thdhBench({ state: <JSON vừa chép>, extra: 60, view: 'side' })
 *      Cả hai bản nhận cùng một state ⇒ mô phỏng (seed theo ngày/giờ) diễn ra giống hệt nhau.
 *
 * Mỗi khung được bước thủ công với delta cố định 16.67 ms (không phụ thuộc rAF / tab ẩn),
 * sau khi vẽ thì gọi gl.readPixels 1 điểm ảnh để buộc GPU vẽ xong ⇒ thời gian đo gồm cả phần vẽ.
 */
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function engineName(g) {
    return g.constructor && g.constructor.name === 'Game' && g.app ? 'PixiJS + ECS' : 'Phaser';
  }

  function countObjects(g) {
    let n = 0;
    const walk = (list) => { for (const o of list) { n++; if (o.list) walk(o.list); } };
    for (const s of g.scene.getScenes(true)) walk(s.children.list);
    return n;
  }

  function stats(samples) {
    const s = [...samples].sort((a, b) => a - b);
    const pick = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    return { mean: +mean.toFixed(3), p50: +pick(0.5).toFixed(3), p95: +pick(0.95).toFixed(3), p99: +pick(0.99).toFixed(3), max: +s[s.length - 1].toFixed(3) };
  }

  window.thdhBench = async function thdhBench(opts = {}) {
    const g = window.thdh.game;
    const G = window.thdh.G;
    const o = { view: 'side', extra: 0, managerSpeed: 0, warmup: 60, frames: 600, flush: true, ...opts };
    // Tạm dừng vòng lặp thật của engine: chỉ vòng bước tay dưới đây chạy, hai bản cùng điều kiện
    // (tab đang hiện hay ẩn đều như nhau).
    const pauseLoop = () => (g.loop.sleep ? g.loop.sleep() : g.loop.stop());
    const resumeLoop = () => (g.loop.wake ? g.loop.wake() : g.loop.start());
    pauseLoop();
    try {
      return await runBench(g, G, o);
    } finally {
      resumeLoop();
    }
  };

  /**
   * Đo bằng vòng lặp thật của engine (rAF, giới hạn FPS như khi chơi) trong `o.realtime` giây:
   * khoảng cách giữa các khung (độ mượt) và thời gian xử lý mỗi khung (prestep → postrender).
   * Tab phải đang hiển thị, nếu không trình duyệt sẽ hãm rAF.
   */
  async function realtime(g, o) {
    const intervals = [];
    const work = [];
    let t0 = 0;
    let last = 0;
    const onPre = () => { t0 = performance.now(); };
    const onPost = () => {
      const now = performance.now();
      work.push(now - t0);
      if (last) intervals.push(now - last);
      last = now;
    };
    let hidden = document.visibilityState !== 'visible';
    const onVis = () => { if (document.visibilityState !== 'visible') hidden = true; };
    document.addEventListener('visibilitychange', onVis);
    g.events.on('prestep', onPre);
    g.events.on('postrender', onPost);
    (g.loop.wake ? g.loop.wake() : g.loop.start());
    await sleep(o.realtime * 1000);
    (g.loop.sleep ? g.loop.sleep() : g.loop.stop());
    g.events.off('prestep', onPre);
    g.events.off('postrender', onPost);
    document.removeEventListener('visibilitychange', onVis);
    const shop = g.scene.getScene('Shop');
    return {
      engine: engineName(g),
      // Tab bị ẩn trong lúc đo ⇒ trình duyệt hãm rAF, game tự tạm dừng: bỏ kết quả này.
      valid: !hidden && !shop?.pauseLayer,
      scenario: { view: o.view, extra: o.extra, managerSpeed: o.managerSpeed, seconds: o.realtime },
      visible: document.visibilityState,
      fps: +(1000 / (intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length))).toFixed(1),
      frameIntervalMs: stats(intervals),
      over33: intervals.filter((x) => x > 33.4).length,
      over50: intervals.filter((x) => x > 50).length,
      workMs: stats(work),
      objects: countObjects(g),
      customers: shop?.session?.customers?.length ?? 0,
    };
  }

  async function runBench(g, G, o) {
    const gl = g.renderer.gl;
    const pixel = new Uint8Array(4);
    let time = performance.now();
    const step = () => { time += 1000 / 60; g.step(time, 1000 / 60); };
    const flush = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const settle = async (n) => { for (let i = 0; i < n; i++) { step(); if (i % 10 === 9) await sleep(0); } };

    // Cùng một state cho cả hai bản.
    if (o.state) G.state = typeof o.state === 'string' ? JSON.parse(o.state) : structuredClone(o.state);
    G.state.settings.sound = false;
    G.state.settings.viewMode = o.view === 'top' ? 'topdown' : 'side';
    if (!G.state.tutorialsSeen.includes('topdown')) G.state.tutorialsSeen.push('topdown');
    G.state.settings.idleAutoPlay = 0;
    G.state.phase = 'morning';

    for (const s of g.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused()) g.scene.stop(s.sys.settings.key);
    await settle(2);
    g.scene.start('Morning');
    await settle(10);
    {
      g.scene.getScene('Morning').tryOpen();
      await settle(10);
      const shop = g.scene.getScene('Shop');
      if (!shop || !shop.session) throw new Error('Không vào được màn bán hàng');
      // Người chơi tự động để quầy luôn được phục vụ như nhau ở cả hai bản.
      shop.session.autoPlayer = true;
      shop.session.autoPlayerReact = 0.8;
      shop.session.autoRefill = true;
      if (o.managerSpeed) { G.state.today.managerDay = true; G.state.manager.speed = o.managerSpeed; }
      for (let i = 0; i < o.extra; i++) shop.session.spawn();
      if (o.view === 'watch') shop.liveMap.open();
    }
    await settle(o.warmup);
    if (o.realtime) return realtime(g, o);

    const total = [];
    const update = [];
    const render = [];
    let t0 = 0;
    let tRender = 0;
    const onPre = () => { t0 = performance.now(); };
    const onPreRender = () => { tRender = performance.now(); update.push(tRender - t0); };
    g.events.on('prestep', onPre);
    g.events.on('prerender', onPreRender);
    for (let i = 0; i < o.frames; i++) {
      const a = performance.now();
      step();
      if (o.flush) flush();
      const b = performance.now();
      total.push(b - a);
      render.push(b - tRender);
      if (i % 30 === 29) await sleep(0);
    }
    g.events.off('prestep', onPre);
    g.events.off('prerender', onPreRender);

    const shop = g.scene.getScene('Shop');
    return {
      engine: engineName(g),
      scenario: { view: o.view, extra: o.extra, managerSpeed: o.managerSpeed, frames: o.frames, gpuSync: o.flush },
      canvas: `${g.canvas.width}x${g.canvas.height}`,
      frameMs: stats(total),
      updateMs: stats(update),
      renderMs: stats(render),
      objects: countObjects(g),
      customers: shop?.session?.customers?.length ?? 0,
    };
  }
})();
