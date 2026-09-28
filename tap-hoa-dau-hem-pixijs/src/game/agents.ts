import type * as Engine from '../engine';
import type { Customer } from '../core/customers';
import type { CustomerType } from '../core/data';
import type { Cell } from '../core/layout';
import type { Goal } from '../core/liveMap';
import { world } from '../engine/runtime';
import type { Entity } from '../ecs/world';
import { setWalkFrame } from '../ui/art';

/**
 * Nhân vật trên sơ đồ trực tiếp (khách, nhân viên, người chơi) dưới dạng component ECS.
 * Dữ liệu nằm liền trong mảng dày của store; các system dưới đây duyệt một lượt mỗi khung
 * thay vì mỗi nhân vật tự cập nhật. Thêm nhiều khách chỉ làm dài mảng, không thêm vòng lặp / listener.
 */
export interface AgentComponent {
  entity: Entity;
  /** Sơ đồ sở hữu (một màn có thể có hai sơ đồ: xem và chơi). */
  owner: object;
  id: string;
  sprite: Engine.GameObjects.Image;
  tag: Engine.GameObjects.Text | null;
  type: CustomerType;
  /** Vị trí theo ô (số thực, 0 = mép trái/trên ô đầu). */
  pos: { x: number; y: number };
  path: Cell[];
  goal: Goal;
  goalKey: string;
  speed: number;
  /** Lệch nhỏ để nhiều người đứng cùng ô không chồng khít lên nhau. */
  jitter: { x: number; y: number };
  /** Khách đã rời phiên: đi ra cửa rồi xóa. */
  leaving: boolean;
  /** Đã rời phiên khi còn đang đi ra quầy: tới quầy trước rồi mới ra cửa. */
  viaCounter?: boolean;
  hidden: boolean;
  /** Đang quay lưng (đi lên / đứng nhìn vào kệ phía trên). */
  back: boolean;
  /** Lệch thêm khi đứng chung ô với người khác (theo ô). */
  spread: { x: number; y: number };
  customer?: Customer;
  staffId?: string;
}

export const Agents = world.store<AgentComponent>('agent');

export function spawnAgent(data: Omit<AgentComponent, 'entity'>): AgentComponent {
  const entity = world.create();
  return Agents.set(entity, { ...data, entity });
}

export function despawnAgent(a: AgentComponent): void {
  world.destroy(a.entity);
  Agents.delete(a.entity);
}

/** Hệ di chuyển: đi dọc đường tìm được, đổi hướng nhìn; tới nơi thì đứng lại. */
export function agentMovementSystem(owner: object, dt: number, facesUp: (a: AgentComponent) => boolean): void {
  const list = Agents.dense;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.owner !== owner) continue;
    let move = a.speed * dt;
    const moving = a.path.length > 0;
    while (move > 0 && a.path.length) {
      const next = a.path[0];
      const dx = next.x - a.pos.x;
      const dy = next.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) {
        // Hướng nhìn: đi lên thấy lưng, đi xuống thấy mặt, đi ngang lật trái/phải.
        if (Math.abs(dy) > Math.abs(dx)) a.back = dy < 0;
        else { a.back = false; a.sprite.setFlipX(dx < 0); }
      }
      if (d <= move) {
        a.pos = { x: next.x, y: next.y };
        a.path.shift();
        move -= d;
      } else {
        a.pos = { x: a.pos.x + (dx / d) * move, y: a.pos.y + (dy / d) * move };
        move = 0;
      }
    }
    if (!a.path.length) {
      if (moving) a.back = facesUp(a);
      setWalkFrame(a.sprite, a.type, 0, a.back);
      if (a.goal.kind === 'away') a.hidden = true;
    }
  }
}

/** Hệ hoạt ảnh bước chân: đổi khung cho người đang đi. */
export function agentWalkSystem(owner: object, frame: 0 | 1): void {
  const list = Agents.dense;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.owner === owner && a.path.length) setWalkFrame(a.sprite, a.type, frame, a.back);
  }
}

/** Hệ đặt hình: đổi vị trí theo ô sang tọa độ màn hình, sắp chiều sâu theo y. */
export function agentPlacementSystem(owner: object, geom: { gx: number; gy: number; cell: number }, personH: number, selectedId: string | null): void {
  const { gx, gy, cell } = geom;
  const list = Agents.dense;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.owner !== owner) continue;
    const x = gx + (a.pos.x + 0.5 + a.spread.x) * cell + a.jitter.x;
    const y = gy + (a.pos.y + 0.5 + a.spread.y) * cell + cell * 0.35 + a.jitter.y;
    a.sprite.setPosition(x, y).setVisible(!a.hidden).setDepth(y);
    a.tag?.setPosition(x, y - personH - 1).setVisible(!a.hidden).setDepth(y + 1);
    a.sprite.setTint(a.id === selectedId ? 0xfff176 : 0xffffff);
  }
}
