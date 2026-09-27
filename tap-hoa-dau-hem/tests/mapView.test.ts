import { describe, expect, it } from 'vitest';
import { clampCam, maxZoom, panBy, toLocal, toScreen, zoomAt } from '../src/core/mapView';

const content = { x: 6, y: 54, w: 304, h: 304 };
const view = { x: 0, y: 50, w: 314, h: 313 };
const MAX = 3;

describe('mapView', () => {
  it('zoom 1 giữ nguyên sơ đồ và không cho kéo lệch ra ngoài khung', () => {
    expect(clampCam({ zoom: 1, tx: 0, ty: 0 }, content, view, MAX)).toEqual({ zoom: 1, tx: 0, ty: 0 });
    const moved = panBy({ zoom: 1, tx: 0, ty: 0 }, -500, 500, content, view, MAX);
    expect(moved.tx).toBe(view.x - content.x);
    expect(moved.ty).toBe(view.y + view.h - (content.y + content.h));
  });

  it('phóng giữ nguyên điểm dưới ngón tay / con trỏ', () => {
    const px = 150, py = 200;
    const before = toLocal({ zoom: 1, tx: 0, ty: 0 }, px, py);
    const cam = zoomAt({ zoom: 1, tx: 0, ty: 0 }, 2, px, py, content, view, MAX);
    expect(cam.zoom).toBe(2);
    const after = toScreen(cam, before.x, before.y);
    expect(after.x).toBeCloseTo(px);
    expect(after.y).toBeCloseTo(py);
  });

  it('giới hạn zoom và khi phóng to thì sơ đồ luôn phủ kín khung', () => {
    let cam = zoomAt({ zoom: 1, tx: 0, ty: 0 }, 10, 0, 50, content, view, MAX);
    expect(cam.zoom).toBe(MAX);
    cam = panBy(cam, 10000, 10000, content, view, MAX);
    expect(toScreen(cam, content.x, content.y).x).toBeCloseTo(view.x);
    expect(toScreen(cam, content.x, content.y).y).toBeCloseTo(view.y);
    cam = panBy(cam, -10000, -10000, content, view, MAX);
    expect(toScreen(cam, content.x + content.w, 0).x).toBeCloseTo(view.x + view.w);
    expect(zoomAt(cam, 0.01, 0, 0, content, view, MAX).zoom).toBe(1);
  });

  it('ô càng nhỏ (đất rộng) thì được phóng càng nhiều', () => {
    expect(maxZoom(38)).toBeCloseTo(110 / 38);
    expect(maxZoom(20)).toBeGreaterThan(maxZoom(38));
    expect(maxZoom(80)).toBe(2.5);
  });
});
