/**
 * Engine của bản PixiJS: PixiJS v8 vẽ, ECS tự viết (src/ecs) chạy mọi thứ theo thời gian.
 * API đặt tên theo đúng phần Phaser mà game gốc dùng, để các màn chơi chuyển sang giữ nguyên luật và bố cục.
 */
import * as GO from './gameobjects';
import { SceneEvents } from './scene/Scene';
import { Pointer as PointerClass } from './input/Pointer';
import type { EventData as InputEventData } from './input/Input';
import { Tween as TweenClass } from './tweens/Tween';
import { TimerEvent as TimerEventClass } from './time/TimerEvent';
import { Rectangle as GeomRectangle, Circle as GeomCircle } from './geom';
import * as ColorNs from './color';
import { FilterMode as TexFilterMode } from './textures';
import type { RoundedRectRadius as RRR } from './gameobjects/Graphics';
import type { Camera as CameraClass } from './scene/Scene';

export { Game } from './Game';
export { Scene } from './scene/Scene';

export const AUTO = 0;
/** Giá trị renderer.type khi chạy WebGL (RendererType.WEBGL của PixiJS). */
export const WEBGL = 1;
export const CANVAS = 4;

export namespace GameObjects {
  export const GameObject = GO.GameObject;
  export type GameObject = GO.GameObject;
  export const Container = GO.Container;
  export type Container = GO.Container;
  export const Graphics = GO.Graphics;
  export type Graphics = GO.Graphics;
  export const Text = GO.Text;
  export type Text = GO.Text;
  export const Image = GO.Image;
  export type Image = GO.Image;
  export const Sprite = GO.Image;
  export type Sprite = GO.Image;
  export const Rectangle = GO.Rectangle;
  export type Rectangle = GO.Rectangle;
  export const Arc = GO.Arc;
  export type Arc = GO.Arc;
  export const Zone = GO.Zone;
  export type Zone = GO.Zone;
  export const TileSprite = GO.TileSprite;
  export type TileSprite = GO.TileSprite;
  export const RenderTexture = GO.RenderTexture;
  export type RenderTexture = GO.RenderTexture;
  export const DOMElement = GO.DOMElement;
  export type DOMElement = GO.DOMElement;
  export const NineSlice = GO.NineSlice;
  export type NineSlice = GO.NineSlice;
  export const Events = GO.GameObjectEvents;
  export namespace Components {
    export type Transform = GO.GameObject;
  }
}

export namespace Scenes {
  export const Events = SceneEvents;
}

export namespace Input {
  export const Pointer = PointerClass;
  export type Pointer = PointerClass;
}

export namespace Tweens {
  export const Tween = TweenClass;
  export type Tween = TweenClass;
}

export namespace Time {
  export const TimerEvent = TimerEventClass;
  export type TimerEvent = TimerEventClass;
}

export namespace Geom {
  export const Rectangle = GeomRectangle;
  export type Rectangle = GeomRectangle;
  export const Circle = GeomCircle;
  export type Circle = GeomCircle;
}

export namespace Display {
  export const Color = ColorNs;
}

export namespace Textures {
  export const FilterMode = TexFilterMode;
}

export namespace Cameras {
  export namespace Scene2D {
    export type Camera = CameraClass;
  }
}

export namespace Math {
  export const Clamp = (v: number, min: number, max: number): number => globalThis.Math.max(min, globalThis.Math.min(max, v));
  export const Between = (min: number, max: number): number => globalThis.Math.floor(globalThis.Math.random() * (max - min + 1) + min);
  export const Linear = (a: number, b: number, t: number): number => a + (b - a) * t;
  export const DegToRad = (deg: number): number => (deg * globalThis.Math.PI) / 180;
  export namespace Distance {
    export const Between = (x1: number, y1: number, x2: number, y2: number): number => globalThis.Math.hypot(x2 - x1, y2 - y1);
  }
}

export namespace Renderer {
  export namespace WebGL {
    export type WebGLRenderer = import('pixi.js').Renderer & { getMaxTextureSize?: () => number };
  }
}

export namespace Scale {
  export const FIT = 3;
  export const NO_CENTER = 0;
}

export namespace Types {
  export namespace Input {
    export type EventData = InputEventData;
  }
  export namespace GameObjects {
    export namespace Graphics {
      export type RoundedRectRadius = RRR;
    }
  }
}
