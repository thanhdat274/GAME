import { Components, world } from '../runtime';
import type { Entity } from '../../ecs/world';
import type { Scene } from '../scene/Scene';

export interface TimerConfig {
  delay?: number;
  loop?: boolean;
  repeat?: number;
  callback?: (...args: any[]) => void;
  callbackScope?: unknown;
  args?: unknown[];
  startAt?: number;
  timeScale?: number;
  paused?: boolean;
}

const MAX = 999999999999;

/**
 * Hẹn giờ theo đồng hồ của scene; là một entity ECS. Thuật toán chép từ Phaser 3.90 TimerEvent + Clock.
 */
export class TimerEvent {
  readonly entity: Entity;
  readonly scene: Scene;
  delay: number;
  repeat: number;
  loop: boolean;
  repeatCount: number;
  elapsed: number;
  timeScale: number;
  paused: boolean;
  hasDispatched = false;
  callback?: (...args: any[]) => void;
  callbackScope: unknown;
  args: unknown[];

  constructor(scene: Scene, config: TimerConfig) {
    this.scene = scene;
    this.delay = config.delay ?? 0;
    this.repeat = config.repeat ?? 0;
    this.loop = !!config.loop;
    this.callback = config.callback;
    this.callbackScope = config.callbackScope ?? this;
    this.args = config.args ?? [];
    this.timeScale = config.timeScale ?? 1;
    this.elapsed = config.startAt ?? 0;
    this.paused = !!config.paused;
    this.repeatCount = this.repeat === -1 || this.loop ? MAX : this.repeat;
    if (this.delay === 0 && (this.repeat > 0 || this.loop)) throw new Error('TimerEvent infinite loop created via zero delay');
    this.entity = world.create();
    Components.timers.set(this.entity, this);
  }

  get alive(): boolean { return world.isAlive(this.entity); }
  getProgress(): number { return this.elapsed / this.delay; }
  getElapsed(): number { return this.elapsed; }
  getRemaining(): number { return this.delay - this.elapsed; }
  getRemainingSeconds(): number { return this.getRemaining() * 0.001; }

  /** Như Phaser: đánh dấu xong; Clock gỡ ở lượt kế tiếp. */
  remove(dispatchCallback = false): void {
    this.elapsed = this.delay;
    this.hasDispatched = !dispatchCallback;
    this.repeatCount = 0;
  }

  destroy(): void {
    world.destroy(this.entity);
    this.callback = undefined;
  }

  fire(): void {
    this.callback?.apply(this.callbackScope, this.args);
  }
}

/** API `scene.time` (Phaser.Time.Clock): hàng chờ thêm / gỡ xử lý ở đầu mỗi lượt. */
export class Clock {
  now = 0;
  timeScale = 1;
  paused = false;
  private active: TimerEvent[] = [];
  private pendingInsertion: TimerEvent[] = [];
  private pendingRemoval: TimerEvent[] = [];

  constructor(private scene: Scene) {}

  addEvent(config: TimerConfig | TimerEvent): TimerEvent {
    const event = config instanceof TimerEvent ? config : new TimerEvent(this.scene, config);
    this.pendingInsertion.push(event);
    return event;
  }

  delayedCall(delay: number, callback: (...args: any[]) => void, args?: unknown[], scope?: unknown): TimerEvent {
    return this.addEvent({ delay, callback, args, callbackScope: scope });
  }

  removeEvent(events: TimerEvent | TimerEvent[]): this {
    for (const e of Array.isArray(events) ? events : [events]) this.pendingRemoval.push(e);
    return this;
  }

  removeAllEvents(): this {
    this.pendingRemoval = this.pendingRemoval.concat(this.active);
    return this;
  }

  /** Phaser Clock.preUpdate. */
  preUpdate(): void {
    if (!this.pendingRemoval.length && !this.pendingInsertion.length) return;
    for (const event of this.pendingRemoval) {
      const i = this.active.indexOf(event);
      if (i > -1) this.active.splice(i, 1);
      event.destroy();
    }
    for (const event of this.pendingInsertion) this.active.push(event);
    this.pendingRemoval.length = 0;
    this.pendingInsertion.length = 0;
  }

  /** Phaser Clock.update. */
  update(time: number, delta: number): void {
    this.now = time;
    if (this.paused) return;
    delta *= this.timeScale;
    for (const event of this.active) {
      if (event.paused) continue;
      event.elapsed += delta * event.timeScale;
      if (event.elapsed >= event.delay) {
        let remainder = event.elapsed - event.delay;
        event.elapsed = event.delay;
        if (!event.hasDispatched && event.callback) {
          event.hasDispatched = true;
          event.fire();
        }
        if (event.repeatCount > 0) {
          event.repeatCount--;
          if (remainder >= event.delay) {
            while (remainder >= event.delay && event.repeatCount > 0) {
              event.fire();
              remainder -= event.delay;
              event.repeatCount--;
            }
          }
          event.elapsed = remainder;
          event.hasDispatched = false;
        } else if (event.hasDispatched) this.pendingRemoval.push(event);
      }
    }
  }

  /** Scene dừng: hủy mọi hẹn giờ (Phaser Clock.shutdown). */
  shutdown(): void {
    for (const e of [...this.active, ...this.pendingInsertion, ...this.pendingRemoval]) e.destroy();
    this.active.length = 0;
    this.pendingInsertion.length = 0;
    this.pendingRemoval.length = 0;
  }
}
