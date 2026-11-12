/**
 * Pele draws a connection's label on top of its line, hiding part of the line.
 * Move each label beside the line instead: above or below a line that runs
 * across, left or right of one that runs up and down, on whichever side is
 * clearer. Safe to call again after every re-render.
 */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Point = [number, number];

/** Gap between a label and its line. */
const GAP = 4;
const DONE = 'data-volcanic-placed';
/** Cost of a spot that must not be used. */
const BLOCKED = 1000;

function numbers(text: string | null): number[] {
  return (text?.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
}

function pairs(values: number[]): Point[] {
  const points: Point[] = [];
  for (let i = 0; i + 1 < values.length; i += 2) points.push([values[i], values[i + 1]]);
  return points;
}

/** Points along an edge path, close enough together to test for overlaps. */
function trace(path: Element): Point[] {
  const corners = pairs(numbers(path.getAttribute('d')));
  const points: Point[] = [];
  for (let i = 0; i + 1 < corners.length; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 6));
    for (let s = 0; s < steps; s++) points.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
  }
  if (corners.length) points.push(corners[corners.length - 1]);
  return points;
}

function nodeBox(node: Element): Box | null {
  const shape = node.firstElementChild;
  if (!shape) return null;
  const [tx = 0, ty = 0] = numbers(node.getAttribute('transform'));
  let points: Point[];
  const attr = (name: string): number => Number(shape.getAttribute(name) ?? 0);
  switch (shape.tagName.toLowerCase()) {
    case 'rect':
      points = [[attr('x'), attr('y')], [attr('x') + attr('width'), attr('y') + attr('height')]];
      break;
    case 'circle':
      points = [[attr('cx') - attr('r'), attr('cy') - attr('r')], [attr('cx') + attr('r'), attr('cy') + attr('r')]];
      break;
    case 'ellipse':
      points = [[attr('cx') - attr('rx'), attr('cy') - attr('ry')], [attr('cx') + attr('rx'), attr('cy') + attr('ry')]];
      break;
    default:
      points = pairs(numbers(shape.getAttribute('points') ?? shape.getAttribute('d')));
  }
  if (!points.length) return null;
  const xs = points.map((p) => p[0] + tx);
  const ys = points.map((p) => p[1] + ty);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (box: Box, [px, py]: Point): boolean => px > box.x && px < box.x + box.w && py > box.y && py < box.y + box.h;

export function placeEdgeLabels(root: Element): void {
  const svg = root.matches('svg') ? root : root.querySelector('svg');
  if (!svg) return;
  const labels = Array.from(svg.querySelectorAll('g.pele-edge-label')).filter((g) => !g.hasAttribute(DONE));
  if (!labels.length) return;

  const view = numbers(svg.getAttribute('viewBox'));
  const bounds: Box | null = view.length === 4 ? { x: view[0], y: view[1], w: view[2], h: view[3] } : null;
  const nodes = Array.from(svg.querySelectorAll('g.pele-node')).map(nodeBox).filter((b): b is Box => !!b);
  const lines = new Map<string, Point[]>();
  for (const edge of Array.from(svg.querySelectorAll('g.pele-edge'))) {
    const path = edge.querySelector('path:not(.pele-marker)');
    if (path) lines.set(edge.getAttribute('data-id') ?? '', trace(path));
  }
  const placed: Box[] = [];

  for (const label of labels) {
    const rect = label.querySelector('rect');
    const own = lines.get(label.getAttribute('data-id') ?? '');
    if (!rect || !own || own.length < 2) continue;
    const box: Box = { x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')), w: Number(rect.getAttribute('width')), h: Number(rect.getAttribute('height')) };
    if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) continue;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;

    // Which way is the line heading where the label sits?
    let nearest = 0;
    for (let i = 1; i < own.length; i++) {
      if (Math.hypot(own[i][0] - cx, own[i][1] - cy) < Math.hypot(own[nearest][0] - cx, own[nearest][1] - cy)) nearest = i;
    }
    const before = own[Math.max(0, nearest - 2)];
    const after = own[Math.min(own.length - 1, nearest + 2)];
    const across = Math.abs(after[0] - before[0]) >= Math.abs(after[1] - before[1]);

    // Two candidate spots, the conventional one (above / right) first.
    const shifts: Point[] = across ? [[0, -(box.h / 2 + GAP)], [0, box.h / 2 + GAP]] : [[box.w / 2 + GAP, 0], [-(box.w / 2 + GAP), 0]];
    let best: { shift: Point; cost: number; spot: Box } | null = null;
    for (const shift of shifts) {
      const spot: Box = { x: box.x + shift[0], y: box.y + shift[1], w: box.w, h: box.h };
      const mid: Point = [spot.x + spot.w / 2, spot.y + spot.h / 2];
      let cost = 0;
      // Sitting on a shape or another label is not acceptable at all.
      cost += nodes.filter((n) => overlaps(spot, n)).length * BLOCKED;
      cost += placed.filter((p) => overlaps(spot, p)).length * BLOCKED;
      // Needing a little more room at the edge of the picture is fine; the picture grows.
      if (bounds && (spot.x < bounds.x || spot.y < bounds.y || spot.x + spot.w > bounds.x + bounds.w || spot.y + spot.h > bounds.y + bounds.h)) cost += 20;
      let nearestOther = Infinity;
      for (const [id, points] of lines) {
        const mine = id === label.getAttribute('data-id');
        for (const p of points) {
          if (contains(spot, p)) cost += mine ? 3 : 15;
          if (!mine) nearestOther = Math.min(nearestOther, Math.hypot(p[0] - mid[0], p[1] - mid[1]));
        }
      }
      // Lean away from neighbouring lines, so paired connections get labels on their outer sides.
      cost += Math.max(0, 60 - nearestOther) / 6;
      if (!best || cost < best.cost) best = { shift, cost, spot };
    }
    if (!best || best.cost >= BLOCKED) continue; // No clear spot beside the line: leave it where Pele put it.

    label.setAttribute('transform', `translate(${best.shift[0]},${best.shift[1]})`);
    label.setAttribute(DONE, '');
    placed.push(best.spot);
  }

  if (bounds && placed.length) grow(svg, bounds, placed);
}

/** Widen the picture just enough to show labels that moved past its edge. */
function grow(svg: Element, bounds: Box, boxes: Box[]): void {
  const pad = 4;
  const left = Math.min(bounds.x, ...boxes.map((b) => b.x - pad));
  const top = Math.min(bounds.y, ...boxes.map((b) => b.y - pad));
  const right = Math.max(bounds.x + bounds.w, ...boxes.map((b) => b.x + b.w + pad));
  const bottom = Math.max(bounds.y + bounds.h, ...boxes.map((b) => b.y + b.h + pad));
  if (left === bounds.x && top === bounds.y && right === bounds.x + bounds.w && bottom === bounds.y + bounds.h) return;
  const width = right - left;
  const height = bottom - top;
  svg.setAttribute('viewBox', `${left} ${top} ${width} ${height}`);
  // Keep the drawing at the same scale: grow the stated size by the same amount.
  for (const [name, before, after] of [['width', bounds.w, width], ['height', bounds.h, height]] as [string, number, number][]) {
    const value = Number(svg.getAttribute(name));
    if (Number.isFinite(value) && value > 0 && before > 0) svg.setAttribute(name, String(Math.round((value * after) / before)));
  }
}
