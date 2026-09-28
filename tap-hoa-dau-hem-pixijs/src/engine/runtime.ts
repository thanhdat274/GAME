import type { Renderer } from 'pixi.js';
import { World, type ComponentStore } from '../ecs/world';
import type { Game } from './Game';
import type { Scene } from './scene/Scene';
import type { Tween } from './tweens/Tween';
import type { TimerEvent } from './time/TimerEvent';

/**
 * Trạng thái dùng chung của runtime: một ECS world cho cả game.
 *
 * Mọi thứ "chạy theo thời gian" đều là entity trong world này:
 * - Tween (hiệu ứng chuyển động)        → component `tweens`
 * - Timer (delayedCall / addEvent)        → component `timers`
 * - Scene đang chạy (vòng update mỗi khung) → component `scenes`
 * - Hàm update đăng ký thêm (cuộn quán tính, bảng đo...) → component `tickers`
 * - Nhân vật di chuyển trên sơ đồ / quầy  → các component trong `src/game/ecs`
 */
export const world = new World();

export const Components = {
  tweens: world.store<Tween>('tween'),
  timers: world.store<TimerEvent>('timer'),
  scenes: world.store<Scene>('scene'),
} satisfies Record<string, ComponentStore<unknown>>;

export const runtime: { game: Game | null; renderer: Renderer | null } = {
  game: null,
  renderer: null,
};

export function renderer(): Renderer {
  if (!runtime.renderer) throw new Error('Renderer chưa sẵn sàng');
  return runtime.renderer;
}
