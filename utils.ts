import { Vector2 } from "./types";

export const add = (v1: Vector2, v2: Vector2): Vector2 => ({ x: v1.x + v2.x, y: v1.y + v2.y });
export const sub = (v1: Vector2, v2: Vector2): Vector2 => ({ x: v1.x - v2.x, y: v1.y - v2.y });
export const mult = (v: Vector2, n: number): Vector2 => ({ x: v.x * n, y: v.y * n });
export const mag = (v: Vector2): number => Math.sqrt(v.x * v.x + v.y * v.y);
export const normalize = (v: Vector2): Vector2 => {
  const m = mag(v);
  return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
};
export const dist = (v1: Vector2, v2: Vector2): number => Math.sqrt(Math.pow(v2.x - v1.x, 2) + Math.pow(v2.y - v1.y, 2));

export const distToSegment = (p: Vector2, v: Vector2, w: Vector2): number => {
  const l2 = dist(v, w) * dist(v, w);
  if (l2 === 0) return dist(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projection = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
  return dist(p, projection);
};

export const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

export const checkCircleRectCollision = (circlePos: Vector2, radius: number, rect: {x: number, y: number, width: number, height: number}) => {
  // Normalize rect coords (handle negative width/height)
  const rx = rect.width > 0 ? rect.x : rect.x + rect.width;
  const ry = rect.height > 0 ? rect.y : rect.y + rect.height;
  const rw = Math.abs(rect.width);
  const rh = Math.abs(rect.height);

  const testX = clamp(circlePos.x, rx, rx + rw);
  const testY = clamp(circlePos.y, ry, ry + rh);

  const distX = circlePos.x - testX;
  const distY = circlePos.y - testY;
  const distance = Math.sqrt(distX * distX + distY * distY);

  if (distance <= radius) {
    return {
      collided: true,
      normal: normalize({ x: distX, y: distY }),
      overlap: radius - distance
    };
  }
  return { collided: false, normal: { x: 0, y: 0 }, overlap: 0 };
};