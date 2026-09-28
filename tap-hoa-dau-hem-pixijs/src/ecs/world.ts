/**
 * ECS tối giản, không phụ thuộc thư viện ngoài.
 *
 * - Entity chỉ là một số nguyên; id được tái sử dụng sau khi hủy (kèm "thế hệ" để phát hiện id cũ).
 * - Mỗi loại component lưu trong một sparse set: mảng dày (duyệt liên tục, thân thiện cache)
 *   + mảng thưa tra ngược entity → vị trí trong mảng dày. Thêm / xóa / tra cứu đều O(1).
 * - System là hàm chạy theo thứ tự ưu tiên mỗi khung hình; truy vấn nhiều component duyệt theo
 *   store nhỏ nhất rồi lọc các store còn lại.
 */

export type Entity = number;

const INDEX_BITS = 20;
const INDEX_MASK = (1 << INDEX_BITS) - 1;

export const entityIndex = (e: Entity): number => e & INDEX_MASK;

/** Kho một loại component (sparse set). */
export class ComponentStore<T> {
  readonly dense: T[] = [];
  readonly entities: Entity[] = [];
  private sparse: Int32Array = new Int32Array(256).fill(-1);

  constructor(readonly name: string) {}

  get size(): number {
    return this.dense.length;
  }

  has(e: Entity): boolean {
    const i = entityIndex(e);
    if (i >= this.sparse.length) return false;
    const d = this.sparse[i];
    return d >= 0 && this.entities[d] === e;
  }

  get(e: Entity): T | undefined {
    const i = entityIndex(e);
    if (i >= this.sparse.length) return undefined;
    const d = this.sparse[i];
    return d >= 0 && this.entities[d] === e ? this.dense[d] : undefined;
  }

  set(e: Entity, value: T): T {
    const i = entityIndex(e);
    if (i >= this.sparse.length) {
      let n = this.sparse.length;
      while (n <= i) n *= 2;
      const next = new Int32Array(n).fill(-1);
      next.set(this.sparse);
      this.sparse = next;
    }
    const d = this.sparse[i];
    if (d >= 0 && this.entities[d] === e) {
      this.dense[d] = value;
      return value;
    }
    this.sparse[i] = this.dense.length;
    this.dense.push(value);
    this.entities.push(e);
    return value;
  }

  delete(e: Entity): boolean {
    if (!this.has(e)) return false;
    const i = entityIndex(e);
    const d = this.sparse[i];
    const last = this.dense.length - 1;
    // Đưa phần tử cuối vào chỗ trống để mảng dày luôn liền mạch.
    if (d !== last) {
      const moved = this.entities[last];
      this.dense[d] = this.dense[last];
      this.entities[d] = moved;
      this.sparse[entityIndex(moved)] = d;
    }
    this.dense.pop();
    this.entities.pop();
    this.sparse[i] = -1;
    return true;
  }

  clear(): void {
    for (const e of this.entities) this.sparse[entityIndex(e)] = -1;
    this.dense.length = 0;
    this.entities.length = 0;
  }
}

export interface System {
  readonly name: string;
  /** Nhỏ chạy trước. */
  readonly priority: number;
  update(world: World, dt: number, time: number): void;
}

export class World {
  private generations: number[] = [];
  private free: number[] = [];
  private alive = 0;
  private stores: ComponentStore<unknown>[] = [];
  private systems: System[] = [];
  /** Entity bị hủy giữa lúc system đang duyệt: hoãn tới cuối bước để không làm lệch vòng lặp. */
  private pendingDestroy: Entity[] = [];
  private stepping = false;
  /** Thời gian (ms) mỗi system tiêu tốn ở bước gần nhất, cho bảng đo hiệu năng. */
  readonly timings = new Map<string, number>();

  get entityCount(): number {
    return this.alive;
  }

  store<T>(name: string): ComponentStore<T> {
    const s = new ComponentStore<T>(name);
    this.stores.push(s as ComponentStore<unknown>);
    return s;
  }

  create(): Entity {
    this.alive++;
    const index = this.free.length ? this.free.pop()! : this.generations.push(0) - 1;
    return (this.generations[index] << INDEX_BITS) | index;
  }

  isAlive(e: Entity): boolean {
    const i = entityIndex(e);
    return i < this.generations.length && this.generations[i] === e >>> INDEX_BITS;
  }

  destroy(e: Entity): void {
    if (!this.isAlive(e)) return;
    if (this.stepping) {
      this.pendingDestroy.push(e);
      return;
    }
    this.destroyNow(e);
  }

  private destroyNow(e: Entity): void {
    if (!this.isAlive(e)) return;
    for (const s of this.stores) s.delete(e);
    const i = entityIndex(e);
    this.generations[i] = (this.generations[i] + 1) & 0xfff;
    this.free.push(i);
    this.alive--;
  }

  addSystem(system: System): void {
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
  }

  /** Duyệt các entity có đủ mọi component trong `stores` (store đầu tiên nên là store nhỏ nhất). */
  *query2<A, B>(a: ComponentStore<A>, b: ComponentStore<B>): Generator<[Entity, A, B]> {
    const [small, other] = a.size <= b.size ? [a, b] : [b, a];
    for (let i = small.size - 1; i >= 0; i--) {
      const e = small.entities[i];
      if (!other.has(e)) continue;
      yield [e, a.get(e)!, b.get(e)!];
    }
  }

  step(dt: number, time: number, measure = false): void {
    this.stepping = true;
    try {
      for (const s of this.systems) {
        if (measure) {
          const t0 = performance.now();
          s.update(this, dt, time);
          this.timings.set(s.name, performance.now() - t0);
        } else s.update(this, dt, time);
      }
    } finally {
      this.stepping = false;
      if (this.pendingDestroy.length) {
        const list = this.pendingDestroy;
        this.pendingDestroy = [];
        for (const e of list) this.destroyNow(e);
      }
    }
  }
}
