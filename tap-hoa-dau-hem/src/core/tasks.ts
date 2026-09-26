import type { StaffRole } from './data';

/** Loại việc trong tiệm. Người chơi và nhân viên đều nhận việc từ cùng một hàng đợi. */
export type TaskKind = 'serve' | 'refill' | 'receive' | 'deliver' | 'watch';

export interface Task {
  /** Khóa duy nhất, ví dụ "refill:3:2" hay "deliver:5". */
  key: string;
  kind: TaskKind;
  /** Số lớn làm trước. */
  priority: number;
  claimedBy: string | null;
}

/** Việc mỗi vai trò nhận, theo thứ tự ưu tiên của vai trò. */
export const ROLE_TASKS: Record<StaffRole, TaskKind[]> = {
  cashier: ['serve'],
  refill: ['refill', 'watch'],
  stocker: ['receive', 'refill'],
  delivery: ['deliver'],
  chef: [],
  barista: [],
  branch_manager: [],
};

export const PLAYER = 'player';

/** Hàng đợi việc toàn tiệm: thêm/cập nhật việc, tác nhân nhận việc ưu tiên cao nhất chưa ai nhận. */
export class TaskQueue {
  private tasks = new Map<string, Task>();

  /** Thêm việc hoặc cập nhật độ ưu tiên (giữ người đã nhận). */
  upsert(key: string, kind: TaskKind, priority: number): Task {
    const existing = this.tasks.get(key);
    if (existing) {
      existing.priority = priority;
      return existing;
    }
    const task: Task = { key, kind, priority, claimedBy: null };
    this.tasks.set(key, task);
    return task;
  }

  get(key: string): Task | undefined {
    return this.tasks.get(key);
  }

  /** Bỏ các việc cùng loại không còn trong danh sách `keep` (trừ việc đang có người làm). */
  prune(kind: TaskKind, keep: Set<string>): void {
    for (const [key, t] of this.tasks) if (t.kind === kind && !keep.has(key) && !t.claimedBy) this.tasks.delete(key);
  }

  /**
   * Nhận việc cho `agent`: duyệt loại việc theo thứ tự `kinds` (ưu tiên vai trò), trong mỗi loại lấy việc
   * có độ ưu tiên cao nhất chưa ai nhận.
   */
  claim(agent: string, kinds: TaskKind[]): Task | null {
    for (const kind of kinds) {
      let best: Task | null = null;
      for (const t of this.tasks.values()) {
        if (t.kind !== kind || t.claimedBy) continue;
        if (!best || t.priority > best.priority) best = t;
      }
      if (best) {
        best.claimedBy = agent;
        return best;
      }
    }
    return null;
  }

  /** Nhận đúng một việc cụ thể (người chơi chạm vào ô kệ). Trả false nếu người khác đã nhận. */
  claimKey(agent: string, key: string): boolean {
    const t = this.tasks.get(key);
    if (!t) return false;
    if (t.claimedBy && t.claimedBy !== agent) return false;
    t.claimedBy = agent;
    return true;
  }

  isClaimed(key: string): boolean {
    return !!this.tasks.get(key)?.claimedBy;
  }

  release(key: string): void {
    const t = this.tasks.get(key);
    if (t) t.claimedBy = null;
  }

  complete(key: string): void {
    this.tasks.delete(key);
  }

  /** Nhả mọi việc của một tác nhân (nhân viên hết ca). */
  releaseAgent(agent: string): void {
    for (const t of this.tasks.values()) if (t.claimedBy === agent) t.claimedBy = null;
  }

  list(kind?: TaskKind): Task[] {
    return [...this.tasks.values()].filter((t) => !kind || t.kind === kind);
  }

  toJSON(): Task[] {
    return this.list().map((t) => ({ ...t }));
  }

  static from(tasks: Task[]): TaskQueue {
    const q = new TaskQueue();
    for (const t of tasks) q.tasks.set(t.key, { ...t });
    return q;
  }
}
