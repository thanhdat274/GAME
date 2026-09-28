import type { System, World } from '../ecs/world';
import { Components } from './runtime';
import type { SceneManager } from './scene/SceneManager';
import { SceneEvents } from './scene/Scene';

/** Xử lý hàng đợi start/stop scene ở đầu mỗi khung (như Phaser SceneManager.processQueue). */
export function sceneQueueSystem(scenes: SceneManager): System {
  return { name: 'sceneQueue', priority: 0, update: () => scenes.processQueue() };
}

/**
 * Một nhịp cho từng scene đang chạy (entity có component `scenes`), theo thứ tự scene và đúng thứ tự
 * của Phaser Systems.step: hẹn giờ (preUpdate + update) → tween → sự kiện 'update' → scene.update().
 * Hẹn giờ và tween là entity ECS; ở đây chúng được duyệt theo danh sách của từng scene để giữ thứ tự tạo.
 */
export function sceneStepSystem(scenes: SceneManager): System {
  return {
    name: 'scenes',
    priority: 10,
    update(_world: World, dt: number, time: number) {
      for (const scene of scenes.scenes) {
        const sys = scene.sys;
        if (sys.entity === null || !Components.scenes.has(sys.entity) || !sys.isActive()) continue;
        scene.time.preUpdate();
        sys.events.emit(SceneEvents.PRE_UPDATE, time, dt);
        scene.time.update(time, dt);
        if (!scene.tweens.paused) scene.tweens.step();
        sys.events.emit(SceneEvents.UPDATE, time, dt);
        if (!sys.isActive()) continue;
        scene.update?.(time, dt);
        sys.events.emit(SceneEvents.POST_UPDATE, time, dt);
      }
    },
  };
}
