/** mulberry32: RNG nhỏ, nhanh, có seed để tái hiện một ngày chơi. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Persistable internal state for deterministic continuation across server requests. */
  snapshot(): number {
    return this.s;
  }

  static restore(state: number): Rng {
    const rng = new Rng(0);
    rng.s = state >>> 0;
    return rng;
  }

  /** Số thực trong [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Số nguyên trong [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Chọn theo trọng số; trả về -1 nếu tổng trọng số = 0. */
  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return -1;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Khoảng thời gian theo phân phối mũ với trung bình `mean`. */
  exponential(mean: number): number {
    return -Math.log(1 - this.next()) * mean;
  }
}

export function daySeed(day: number, salt = 0): number {
  return (Math.imul(day + 1, 2654435761) ^ salt) >>> 0;
}
