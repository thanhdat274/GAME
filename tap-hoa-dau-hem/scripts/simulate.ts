/**
 * Mô phỏng N ngày với một người chơi giả để kiểm tra cân bằng.
 * Chạy: npm run simulate -- [số ngày] [kỹ năng 0..1]
 */
import { makeChange } from '../src/core/change';
import { DATA, product } from '../src/core/data';
import { DaySession, endDay, openShop, startNextDay } from '../src/core/day';
import { Rng } from '../src/core/rng';
import { createNewGame, formatMoney, shelfCount, unlockedProducts, type GameState } from '../src/core/state';
import { assignCounterSlot, autoArrange, buyStock, checkCart } from '../src/core/stock';

const days = Number(process.argv[2] ?? 7);
const skill = Number(process.argv[3] ?? 0.8);
const rng = new Rng(2024);

/** Nhập hàng: mỗi món mở khóa nhắm tồn = bán hôm qua × 1.3 (tối thiểu 8), trong giới hạn tiền và kho. */
function restock(s: GameState): void {
  const products = unlockedProducts(s.level).sort((a, b) => a.cost - b.cost);
  const cart: Record<string, number> = {};
  for (const p of products) {
    const target = Math.max(8, Math.ceil((s.yesterdaySold[p.id] ?? 0) * 1.3));
    const have = (s.warehouse[p.id] ?? 0) + s.shelves.flat().filter((x) => x.productId === p.id).reduce((a, b) => a + b.qty, 0);
    let want = Math.max(0, target - have);
    while (want > 0) {
      cart[p.id] = (cart[p.id] ?? 0) + 1;
      if (!checkCart(s, cart).ok) {
        cart[p.id]--;
        break;
      }
      want--;
    }
  }
  buyStock(s, cart);
}

function playDay(s: GameState): void {
  openShop(s);
  const d = new DaySession(s, rng.int(1, 1e9));
  const react = 0.9 - skill * 0.5; // giây mỗi thao tác
  let cooldown = 0;
  let changeTimer = 0;
  while (!d.ended) {
    d.tick(0.1);
    cooldown -= 0.1;
    // Nạp kệ trống khi rảnh.
    for (let r = 0; r < shelfCount(s.level); r++)
      for (let c = 0; c < 6; c++) if (s.shelves[r][c].qty <= 1) d.startRefill(r, c);
    const c = d.front;
    if (!c || cooldown > 0) continue;
    if (c.status === 'scanning') {
      if (!c.counterRequestResolved) {
        const line = c.order.find((item) => item.counterLine && item.missing === 0);
        const slot = line ? s.counter.findIndex((item) => item.productId === line.productId && item.qty > 0) : -1;
        if (slot >= 0) d.serveCounterRequest(slot);
      } else {
        const line = c.order.find((item) => item.picked > item.scanned);
        if (line) d.scanItem(line.productId);
      }
      cooldown = react;
      changeTimer = 0;
    } else if (c.status === 'paying') {
      changeTimer += 0.1;
      if (changeTimer < 1 + (1 - skill) * 3) continue;
      const bills = makeChange(c.changeDue);
      if (rng.next() > skill) bills.pop(); // thối thiếu
      bills.forEach((b) => d.addBill(b));
      d.giveChange();
      cooldown = react;
    }
  }
}

let s = createNewGame();
console.log(`Mô phỏng ${days} ngày, kỹ năng ${skill}`);
console.log('Ngày | Lv | EXP  | Khách (vui/bỏ) | Doanh thu | Lãi gộp | Tip    | Tiền cuối ngày | Sao');
for (let i = 0; i < days; i++) {
  restock(s);
  autoArrange(s);
  if (s.level >= 3) {
    const counterProduct = unlockedProducts(s.level).find((p) => p.behindCounter && (s.warehouse[p.id] ?? 0) > 0);
    if (counterProduct) assignCounterSlot(s, 0, counterProduct.id);
  }
  playDay(s);
  const sum = endDay(s);
  console.log(
    [
      String(sum.day).padStart(4),
      String(s.level).padStart(2),
      String(s.exp).padStart(4),
      `${sum.served + sum.left} (${sum.happy}/${sum.left})`.padEnd(14),
      formatMoney(sum.revenue).padStart(9),
      formatMoney(sum.grossProfit).padStart(7),
      formatMoney(sum.tips).padStart(6),
      formatMoney(s.money).padStart(14),
      sum.avgRating.toFixed(2),
    ].join(' | ') + (sum.levelUps.length ? `  ⬆ L${sum.levelUps.join(',')}` : ''),
  );
  startNextDay(s);
}
const stockValue = Object.entries(s.warehouse).reduce((a, [id, q]) => a + product(id).cost * q, 0);
console.log(`Giá trị hàng tồn kho: ${formatMoney(stockValue)} | Vốn ban đầu ${formatMoney(DATA.balance.startMoney)}`);
