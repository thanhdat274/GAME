/**
 * Khung nhìn phóng to / kéo cho sơ đồ trên xuống.
 * Tọa độ màn hình = t + tọa độ gốc × zoom (zoom 1, t = 0 là sơ đồ vẽ nguyên như cũ).
 */
export interface Rect { x: number; y: number; w: number; h: number }
export interface MapCam { zoom: number; tx: number; ty: number }

export const MIN_ZOOM = 1;
/** Phóng tới khi một ô rộng khoảng chừng này điểm (ít nhất 2.5 lần). */
const MAX_CELL_PX = 110;

export function maxZoom(cell: number): number {
  return Math.max(2.5, MAX_CELL_PX / Math.max(1, cell));
}

function clampAxis(t: number, z: number, c0: number, cLen: number, v0: number, vLen: number): number {
  // Nhỏ hơn khung: sơ đồ phải nằm trọn trong khung. Lớn hơn khung: sơ đồ phải phủ kín khung.
  const a = v0 - c0 * z;
  const b = v0 + vLen - (c0 + cLen) * z;
  return Math.min(Math.max(t, Math.min(a, b)), Math.max(a, b));
}

/** Giữ zoom trong giới hạn và không cho kéo sơ đồ ra khỏi khung. */
export function clampCam(cam: MapCam, content: Rect, view: Rect, max: number): MapCam {
  const zoom = Math.min(max, Math.max(MIN_ZOOM, cam.zoom));
  return {
    zoom,
    tx: clampAxis(cam.tx, zoom, content.x, content.w, view.x, view.w),
    ty: clampAxis(cam.ty, zoom, content.y, content.h, view.y, view.h),
  };
}

/** Phóng theo hệ số `factor`, giữ nguyên điểm dưới (px, py) trên màn hình (chỗ ngón tay / con trỏ). */
export function zoomAt(cam: MapCam, factor: number, px: number, py: number, content: Rect, view: Rect, max: number): MapCam {
  const zoom = Math.min(max, Math.max(MIN_ZOOM, cam.zoom * factor));
  const lx = (px - cam.tx) / cam.zoom;
  const ly = (py - cam.ty) / cam.zoom;
  return clampCam({ zoom, tx: px - lx * zoom, ty: py - ly * zoom }, content, view, max);
}

export function panBy(cam: MapCam, dx: number, dy: number, content: Rect, view: Rect, max: number): MapCam {
  return clampCam({ zoom: cam.zoom, tx: cam.tx + dx, ty: cam.ty + dy }, content, view, max);
}

/** Điểm trên màn hình → tọa độ gốc của sơ đồ. */
export function toLocal(cam: MapCam, x: number, y: number): { x: number; y: number } {
  return { x: (x - cam.tx) / cam.zoom, y: (y - cam.ty) / cam.zoom };
}

/** Tọa độ gốc của sơ đồ → điểm trên màn hình. */
export function toScreen(cam: MapCam, x: number, y: number): { x: number; y: number } {
  return { x: cam.tx + x * cam.zoom, y: cam.ty + y * cam.zoom };
}
