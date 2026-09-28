import { Components, world } from '../runtime';
import type { Entity } from '../../ecs/world';
import type { Scene } from '../scene/Scene';
import { getEase, type EaseFn } from './ease';

type Target = Record<string, any>;
type ValueFn = (target: Target, key: string, value: number, targetIndex: number, totalTargets: number, tween: Tween) => number;
type PropValue = number | string | ValueFn | { from?: number | string; to?: number | string; start?: number | string; value?: number };

export interface TweenConfig {
  targets: Target | Target[];
  duration?: number;
  delay?: number;
  ease?: string | EaseFn;
  yoyo?: boolean;
  repeat?: number;
  hold?: number;
  repeatDelay?: number;
  paused?: boolean;
  persist?: boolean;
  onStart?: (tween: Tween, targets: Target[]) => void;
  onUpdate?: (tween: Tween, target: Target, key: string, current: number, previous: number) => void;
  onComplete?: (tween: Tween, targets: Target[]) => void;
  onYoyo?: (tween: Tween, target: Target, key: string, current: number, previous: number) => void;
  onRepeat?: (tween: Tween, target: Target, key: string, current: number, previous: number) => void;
  onStop?: (tween: Tween, targets: Target[]) => void;
  [prop: string]: unknown;
}

export interface CounterConfig {
  from?: number;
  to?: number;
  duration?: number;
  delay?: number;
  ease?: string | EaseFn;
  yoyo?: boolean;
  repeat?: number;
  onUpdate?: (tween: Tween) => void;
  onComplete?: (tween: Tween) => void;
}

const RESERVED = new Set(['targets', 'duration', 'delay', 'ease', 'yoyo', 'repeat', 'hold', 'repeatDelay', 'paused', 'persist', 'onStart', 'onUpdate', 'onComplete', 'onYoyo', 'onRepeat', 'onStop', 'props', 'loop', 'completeDelay', 'callbackScope']);
const MAX = 999999999999;

type Getter = (target: Target, key: string, value: number, targetIndex: number, totalTargets: number, tween: Tween) => number;
const identity: Getter = (_t, _k, v) => v;

/** Chuyển giá trị thuộc tính trong cấu hình thành các hàm lấy giá trị như Phaser GetValueOp. */
function valueOp(spec: PropValue): { getStart: Getter; getEnd: Getter; getActive?: Getter } {
  if (typeof spec === 'number') return { getStart: identity, getEnd: () => spec };
  if (typeof spec === 'string') {
    const m = /^([+\-*/])=(-?[\d.]+)$/.exec(spec.trim());
    if (m) {
      const n = Number(m[2]);
      const op = m[1];
      return { getStart: identity, getEnd: (_t, _k, v) => (op === '+' ? v + n : op === '-' ? v - n : op === '*' ? v * n : v / n) };
    }
    const n = Number(spec);
    return { getStart: identity, getEnd: () => n };
  }
  if (typeof spec === 'function') return { getStart: identity, getEnd: spec };
  const out = spec.to !== undefined ? valueOp(spec.to as PropValue) : { getStart: identity, getEnd: identity as Getter };
  if (spec.to !== undefined && (spec.from !== undefined || spec.start !== undefined)) {
    const res: { getStart: Getter; getEnd: Getter; getActive?: Getter } = { getStart: out.getStart, getEnd: out.getEnd };
    if (spec.start !== undefined) res.getActive = valueOp(spec.start as PropValue).getEnd;
    if (spec.from !== undefined) res.getStart = valueOp(spec.from as PropValue).getEnd;
    return res;
  }
  if (spec.value !== undefined) return valueOp(spec.value);
  return out;
}

type DataState = 'delay' | 'pending' | 'forward' | 'backward' | 'hold' | 'repeat' | 'complete';

/** Một thuộc tính của một mục tiêu (Phaser TweenData). */
class TweenData {
  start = 0;
  end = 0;
  current = 0;
  previous = 0;
  elapsed = 0;
  progress = 0;
  delay = 0;
  repeatCounter = 0;
  state: DataState = 'pending';
  private readonly getStart: Getter;
  private readonly getEnd: Getter;
  private readonly getActive?: Getter;

  constructor(private tween: Tween, readonly target: Target, readonly key: string, readonly targetIndex: number, spec: PropValue) {
    const op = valueOp(spec);
    this.getStart = op.getStart;
    this.getEnd = op.getEnd;
    this.getActive = op.getActive;
  }

  private get countdown(): boolean { return this.state === 'delay' || this.state === 'hold' || this.state === 'repeat'; }

  reset(): void {
    const t = this.tween;
    this.progress = 0;
    this.elapsed = 0;
    this.delay = t.cfgDelay;
    this.repeatCounter = t.cfgRepeat === -1 ? MAX : t.cfgRepeat;
    this.state = 'pending';
    if (this.delay < t.startDelay) t.startDelay = this.delay;
    if (this.delay > 0) {
      this.elapsed = this.delay;
      this.state = 'delay';
    }
    this.start = 0;
    this.previous = 0;
    this.current = 0;
    this.end = 0;
    if (this.getActive) t.write(this.target, this.key, this.getActive(this.target, this.key, 0, this.targetIndex, t.targets.length, t));
  }

  /** Trả về true nếu vẫn đang chạy. */
  update(delta: number): boolean {
    const t = this.tween;
    const target = this.target;
    const key = this.key;
    if (this.countdown) {
      this.elapsed -= delta;
      if (this.elapsed <= 0) {
        this.elapsed = 0;
        delta = 0;
        if (this.state === 'delay') this.state = 'pending';
        else if (this.state === 'repeat') {
          this.state = 'forward';
          t.dispatch('onRepeat', this);
        } else if (this.state === 'hold') this.fromEnd(0);
      }
    }
    if (this.state === 'pending') {
      // Nhịp đầu: chỉ lấy giá trị bắt đầu, chưa tiến thời gian (đúng Phaser).
      this.start = this.getStart(target, key, t.read(target, key), this.targetIndex, t.targets.length, t);
      this.end = this.getEnd(target, key, this.start, this.targetIndex, t.targets.length, t);
      this.current = this.start;
      t.write(target, key, this.start);
      this.state = 'forward';
      return true;
    }
    const forward = this.state === 'forward';
    const backward = this.state === 'backward';
    if (forward || backward) {
      let elapsed = this.elapsed;
      const duration = t.duration;
      let diff = 0;
      let complete = false;
      elapsed += delta;
      if (elapsed >= duration) {
        diff = elapsed - duration;
        elapsed = duration;
        complete = true;
      } else if (elapsed < 0) elapsed = 0;
      let progress = duration > 0 ? Math.max(0, Math.min(1, elapsed / duration)) : 1;
      this.elapsed = elapsed;
      this.progress = progress;
      this.previous = this.current;
      if (!forward) progress = 1 - progress;
      const v = t.ease(progress);
      this.current = this.start + (this.end - this.start) * v;
      t.write(target, key, this.current);
      if (complete) {
        if (forward) {
          if (t.hold > 0) {
            this.elapsed = t.hold;
            this.state = 'hold';
          } else this.fromEnd(diff);
        } else this.fromStart(diff);
      }
      t.dispatch('onUpdate', this);
    }
    return this.state !== 'complete';
  }

  private fromEnd(diff: number): void {
    if (this.tween.yoyo) this.onRepeat(diff, true, true);
    else if (this.repeatCounter > 0) this.onRepeat(diff, true, false);
    else this.state = 'complete';
  }

  private fromStart(diff: number): void {
    if (this.repeatCounter > 0) this.onRepeat(diff, false, false);
    else this.state = 'complete';
  }

  private onRepeat(diff: number, setStart: boolean, isYoyo: boolean): void {
    const t = this.tween;
    this.elapsed = diff;
    this.progress = t.duration > 0 ? diff / t.duration : 1;
    if (setStart || isYoyo) this.start = this.getStart(this.target, this.key, this.start, this.targetIndex, t.targets.length, t);
    if (isYoyo) {
      this.state = 'backward';
      t.dispatch('onYoyo', this);
      return;
    }
    this.repeatCounter--;
    this.end = this.getEnd(this.target, this.key, this.start, this.targetIndex, t.targets.length, t);
    if (t.repeatDelay > 0) {
      this.elapsed = t.repeatDelay - diff;
      this.current = this.start;
      t.write(this.target, this.key, this.current);
      this.state = 'repeat';
    } else {
      this.state = 'forward';
      t.dispatch('onRepeat', this);
    }
  }
}

type TweenState = 'active' | 'pendingRemove' | 'removed';

/**
 * Tween là một entity trong ECS world; thuật toán thời gian chép từ Phaser 3.90 (Tween + TweenData):
 * nhịp đầu chỉ lấy giá trị bắt đầu, hết delay thì bỏ phần thời gian dư, yoyo/lặp chuyển tiếp phần dư.
 * TweenSystem (src/engine/systems.ts) gọi `update(delta)` theo thứ tự tạo trong từng scene.
 */
export class Tween {
  readonly entity: Entity;
  readonly targets: Target[];
  readonly scene: Scene;
  readonly duration: number;
  readonly ease: EaseFn;
  readonly yoyo: boolean;
  readonly hold: number;
  readonly repeatDelay: number;
  readonly cfgDelay: number;
  readonly cfgRepeat: number;
  startDelay = Number.MAX_SAFE_INTEGER;
  hasStarted = false;
  paused = false;
  state: TweenState = 'active';
  elapsed = 0;
  private data: TweenData[] = [];
  private counter: { value: number } | null;

  constructor(scene: Scene, private config: TweenConfig, counter?: { value: number }) {
    this.scene = scene;
    this.counter = counter ?? null;
    this.targets = (Array.isArray(config.targets) ? config.targets : [config.targets]).filter(Boolean);
    this.duration = Math.max(0, config.duration ?? 1000);
    this.ease = getEase(config.ease);
    this.yoyo = !!config.yoyo;
    this.hold = config.hold ?? 0;
    this.repeatDelay = config.repeatDelay ?? 0;
    this.cfgDelay = config.delay ?? 0;
    this.cfgRepeat = config.repeat ?? 0;
    this.paused = !!config.paused;
    const add = (key: string, spec: PropValue) => this.targets.forEach((target, i) => this.data.push(new TweenData(this, target, key, i, spec)));
    for (const key of Object.keys(config)) if (!RESERVED.has(key)) add(key, config[key] as PropValue);
    const props = config.props as Record<string, PropValue> | undefined;
    if (props) for (const key of Object.keys(props)) add(key, props[key]);
    // Như TweenManager.add → tween.reset() → initTweenData().
    for (const d of this.data) d.reset();
    if (!this.data.length) this.startDelay = 0;
    this.entity = world.create();
    Components.tweens.set(this.entity, this);
    scene.tweens.track(this);
  }

  /** Tên pha cho các hệ thống bên ngoài: 'done' khi đã xong / bị gỡ. */
  get phase(): 'done' | 'active' { return this.state === 'active' ? 'active' : 'done'; }
  get progress(): number { return this.duration > 0 ? Math.min(1, this.elapsed / this.duration) : 1; }
  isPlaying(): boolean { return this.state === 'active' && !this.paused; }
  isActive(): boolean { return this.state === 'active'; }
  getValue(): number { return this.counter ? this.counter.value : this.data[0]?.current ?? 0; }

  pause(): this { this.paused = true; return this; }
  resume(): this { this.paused = false; return this; }
  play(): this { this.paused = false; return this; }

  read(target: Target, key: string): number {
    const v = target[key];
    return typeof v === 'number' ? v : Number(v) || 0;
  }

  write(target: Target, key: string, value: number): void {
    // Đối tượng đã hủy: bỏ ghi (Phaser vẫn ghi vào đối tượng chết, không ảnh hưởng hình).
    if ((target as { active?: boolean }).active === false) return;
    target[key] = value;
  }

  dispatch(name: 'onUpdate' | 'onYoyo' | 'onRepeat', d: TweenData): void {
    const cb = this.config[name];
    if (cb) cb(this, d.target, d.key, d.current, d.previous);
  }

  private finish(): void {
    this.state = 'pendingRemove';
    this.config.onComplete?.(this, this.targets);
  }

  /** Dừng: gọi onStop, không gọi onComplete (Phaser Tween.stop). */
  stop(): this {
    if (this.state !== 'active') return this;
    this.config.onStop?.(this, this.targets);
    this.state = 'pendingRemove';
    return this;
  }
  remove(): this { if (this.state === 'active') this.state = 'pendingRemove'; return this; }
  destroy(): void { this.state = 'removed'; world.destroy(this.entity); }
  /** Kết thúc ngay và gọi onComplete (Phaser Tween.complete, không đặt giá trị cuối). */
  complete(): this { if (this.state === 'active') this.finish(); return this; }

  /** Một nhịp của tween (Phaser Tween.update). Trả về true khi cần gỡ khỏi danh sách. */
  update(delta: number): boolean {
    if (this.state !== 'active') return true;
    if (this.paused) return false;
    if (!this.hasStarted) {
      this.startDelay -= delta;
      if (this.startDelay <= 0) {
        this.hasStarted = true;
        this.config.onStart?.(this, this.targets);
        delta = 0;
      }
    }
    let stillRunning = false;
    for (const d of this.data) if (d.update(delta)) stillRunning = true;
    if (this.counter && this.data.length === 0) stillRunning = false;
    this.elapsed += delta;
    if (!stillRunning) this.finish();
    return this.state !== 'active';
  }
}

/**
 * API `scene.tweens`. Giữ danh sách tween theo thứ tự tạo (như Phaser) để TweenSystem cập nhật đúng thứ tự;
 * đồng hồ tween chạy theo thời gian thực như Phaser 3.90 TweenManager.
 */
export class TweenManager {
  timeScale = 1;
  paused = false;
  /** Tween của scene theo thứ tự tạo. */
  readonly list: Tween[] = [];
  private startTime = 0;
  private prevTime = 0;
  private time = 0;
  private nextTime = 0;
  private readonly maxLag = 500;
  private readonly lagSkip = 33;
  private readonly gap = 1000 / 240;

  constructor(private scene: Scene) {
    this.resetClock();
  }

  /** Gọi khi scene bắt đầu (Phaser tạo lại đồng hồ tween ở mỗi lần start). */
  resetClock(): void {
    this.startTime = Date.now();
    this.prevTime = this.startTime;
    this.time = 0;
    this.nextTime = this.gap;
  }

  /** Delta (ms) cho lượt cập nhật này, đúng thuật toán getDelta của Phaser. */
  getDelta(): number {
    const elapsed = Date.now() - this.prevTime;
    if (elapsed > this.maxLag) this.startTime += elapsed - this.lagSkip;
    this.prevTime += elapsed;
    const time = this.prevTime - this.startTime;
    const overlap = time - this.nextTime;
    let delta = time - this.time * 1000;
    if (overlap > 0) {
      this.time = time / 1000;
      this.nextTime += overlap + (overlap >= this.gap ? 4 : this.gap - overlap);
    } else delta = 0;
    return delta;
  }

  track(tween: Tween): void { this.list.push(tween); }

  /** Một lượt cập nhật tween của scene (Phaser TweenManager.step). */
  step(): void {
    const delta = this.getDelta();
    if (delta <= 0) return;
    const scaled = delta * this.timeScale;
    const list = this.list;
    const toDestroy: Tween[] = [];
    // Duyệt theo độ dài động: tween tạo trong callback được cập nhật ngay trong lượt này, như Phaser.
    for (let i = 0; i < list.length; i++) if (list[i].update(scaled)) toDestroy.push(list[i]);
    for (const t of toDestroy) {
      const idx = list.indexOf(t);
      if (idx > -1 && t.state !== 'active') {
        list.splice(idx, 1);
        t.destroy();
      }
    }
  }

  add(config: TweenConfig): Tween {
    return new Tween(this.scene, config);
  }

  addCounter(config: CounterConfig): Tween {
    const counter = { value: config.from ?? 0 };
    return new Tween(this.scene, {
      targets: counter,
      value: { from: config.from ?? 0, to: config.to ?? 1 },
      duration: config.duration,
      delay: config.delay,
      ease: config.ease,
      yoyo: config.yoyo,
      repeat: config.repeat,
      onUpdate: config.onUpdate ? (tween) => config.onUpdate!(tween) : undefined,
      onComplete: config.onComplete ? (tween) => config.onComplete!(tween) : undefined,
    }, counter);
  }

  getTweensOf(target: object | object[]): Tween[] {
    const set = new Set(Array.isArray(target) ? target : [target]);
    return this.list.filter((t) => t.targets.some((x) => set.has(x)));
  }

  isTweening(target: object): boolean {
    return this.list.some((t) => t.isPlaying() && t.targets.includes(target as Record<string, any>));
  }

  /** Phaser killTweensOf: hủy ngay, không gọi callback. */
  killTweensOf(target: object | object[]): this {
    for (const t of this.getTweensOf(target)) {
      t.destroy();
      const i = this.list.indexOf(t);
      if (i > -1) this.list.splice(i, 1);
    }
    return this;
  }

  killAll(): this {
    for (const t of this.list.slice()) t.destroy();
    this.list.length = 0;
    return this;
  }

  pauseAll(): this { for (const t of this.list) t.pause(); return this; }
  resumeAll(): this { for (const t of this.list) t.resume(); return this; }
}
