type Listener<T> = (payload: T) => void;

/** Event bus có kiểu: core phát sự kiện, scene lắng nghe để vẽ lại. */
export class Emitter<Events extends object> {
  private listeners: { [K in keyof Events]?: Listener<Events[K]>[] } = {};

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    (this.listeners[event] ??= []).push(fn);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: Listener<Events[K]>): void {
    const list = this.listeners[event];
    if (list) this.listeners[event] = list.filter((l) => l !== fn);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const fn of this.listeners[event] ?? []) fn(payload);
  }

  clear(): void {
    this.listeners = {};
  }
}
