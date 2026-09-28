/*
 * So "chữ ký" hiển thị của từng màn giữa bản Phaser và bản PixiJS + ECS:
 * số đối tượng theo loại, và danh sách chữ (kèm vị trí làm tròn) của các đối tượng đang hiện.
 * Dùng: await import('http://localhost:5174/bench/compare.js'); await thdhSignatures(['Title', 'Morning', ...])
 *       await thdhShopSignature(600)   // vào màn bán, chạy 600 khung cố định rồi lấy chữ ký
 */
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function signature(scene) {
    const types = {};
    const texts = [];
    const walk = (list, visible) => {
      for (const o of list) {
        types[o.type] = (types[o.type] || 0) + 1;
        const vis = visible && o.visible !== false;
        if (o.type === 'Text' && vis && o.text) {
          const m = o.getWorldTransformMatrix();
          texts.push(`${o.text.replace(/\n/g, '⏎')}@${Math.round(m.tx)},${Math.round(m.ty)}`);
        }
        if (o.list) walk(o.list, vis);
      }
    };
    walk(scene.children.list, true);
    texts.sort();
    return { types, texts };
  }

  /** Chạy fn khi vòng lặp thật của engine tạm dừng: chỉ các khung bước tay được tính. */
  // Đồng hồ ảo: tween của cả Phaser lẫn engine PixiJS chạy theo Date.now; trong lúc so sánh cho nó
  // tiến đúng 16,67 ms mỗi khung bước tay, để hiệu ứng (chữ nổi, thông báo) không phụ thuộc tốc độ máy.
  let virtualNow = 0;
  const realDateNow = Date.now;

  async function paused(g, fn) {
    if (g.loop.sleep) g.loop.sleep(); else g.loop.stop();
    virtualNow = realDateNow();
    Date.now = () => virtualNow;
    try { return await fn(); } finally {
      Date.now = realDateNow;
      if (g.loop.wake) g.loop.wake(); else g.loop.start();
    }
  }

  function stepper(g) {
    let time = performance.now();
    return async (n) => { for (let i = 0; i < n; i++) { time += 1000 / 60; virtualNow += 1000 / 60; g.step(time, 1000 / 60); if (i % 10 === 9) await sleep(0); } };
  }

  function stopAll(g) {
    for (const s of g.scene.getScenes(false)) if (s.sys.isActive() || s.sys.isPaused()) g.scene.stop(s.sys.settings.key);
  }

  window.thdhSignatures = async function (keys, frames = 30) {
    const g = window.thdh.game;
    return paused(g, () => signatures(g, keys, frames));
  };

  async function signatures(g, keys, frames) {
    const step = stepper(g);
    const out = {};
    for (const key of keys) {
      stopAll(g);
      await step(1);
      g.scene.start(key);
      await step(frames);
      const sc = g.scene.getScene(key);
      out[key] = sc.sys.isActive() ? signature(sc) : { error: 'not active: ' + g.scene.getScenes(true).map((s) => s.sys.settings.key).join(',') };
    }
    return out;
  }

  window.thdhShopSignature = async function (frames = 600) {
    const g = window.thdh.game;
    return paused(g, () => shopSignature(g, frames));
  };

  async function shopSignature(g, frames) {
    const step = stepper(g);
    window.thdh.G.state.settings.sound = false;
    stopAll(g);
    await step(1);
    g.scene.start('Morning');
    await step(5);
    g.scene.getScene('Morning').tryOpen();
    await step(5);
    const shop = g.scene.getScene('Shop');
    shop.session.autoPlayer = true;
    shop.session.autoPlayerReact = 0.8;
    shop.session.autoRefill = true;
    await step(frames);
    const s = window.thdh.G.state;
    return { ...signature(shop), clock: s.clock, money: s.money, served: s.today.served, customers: shop.session.customers.length };
  }
})();
