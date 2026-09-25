import { DATA } from './data';
import type { Rng } from './rng';

/**
 * Tờ tiền khách đưa: tờ nhỏ nhất đủ trả; nếu không có tờ nào đủ thì tổ hợp 2 tờ lớn.
 * Thỉnh thoảng (15%) khách đưa tờ lớn hơn một bậc.
 */
export function customerPayment(total: number, rng: Rng): number {
  const denoms = DATA.balance.denominations;
  const idx = denoms.findIndex((d) => d >= total);
  if (idx === -1) {
    const big = denoms[denoms.length - 1];
    return Math.ceil(total / big) * big;
  }
  const bump = idx + 1 < denoms.length && rng.next() < 0.15 ? 1 : 0;
  // Đơn chẵn đúng mệnh giá thì đôi khi khách đưa vừa đủ.
  if (denoms[idx] === total && bump === 0) return total;
  // Các đơn nhỏ khách thường đưa đúng tổ hợp 2 tờ nếu có thể (ví dụ 15.000 = 10k + 5k).
  const pair = twoNoteExact(total);
  if (pair && rng.next() < 0.3) return total;
  return denoms[idx + bump];
}

function twoNoteExact(total: number): boolean {
  const d = DATA.balance.denominations;
  return d.some((a) => d.some((b) => a + b === total));
}

export type ChangeResult = 'exact' | 'short' | 'over';

export function judgeChange(given: number, due: number): ChangeResult {
  if (given === due) return 'exact';
  return given < due ? 'short' : 'over';
}

/** Cách thối ít tờ nhất bằng các mệnh giá trong ngăn kéo (tham lam là tối ưu với mệnh giá VNĐ). */
export function makeChange(due: number, drawer: number[] = DATA.balance.drawer): number[] {
  const bills: number[] = [];
  let left = due;
  for (const d of [...drawer].sort((a, b) => b - a)) {
    while (left >= d) {
      bills.push(d);
      left -= d;
    }
  }
  if (left !== 0) throw new Error(`Không thối được ${due}`);
  return bills;
}

/** Tip khi thối đúng, nhanh, không hoàn tác và chưa từng thối thiếu. */
export function computeTip(
  opts: { elapsedSec: number; undos: number; shortAttempts: number; tipMul: number; auto: boolean },
  rng: Rng,
): number {
  const b = DATA.balance;
  if (opts.auto || opts.undos > 0 || opts.shortAttempts > 0 || opts.elapsedSec >= b.fastChangeSeconds) return 0;
  const raw = rng.int(b.tipMin / 1000, b.tipMax / 1000) * 1000 * opts.tipMul;
  return Math.max(1000, Math.round(raw / 1000) * 1000);
}
