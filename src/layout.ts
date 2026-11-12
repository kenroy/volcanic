import type { Diagram, DiagramNode, Shape } from './model';

const MARGIN = 60;
/** Space between the edges of neighbouring shapes: along the flow, and across it. */
const GAP = { along: { horizontal: 90, vertical: 80 }, across: { horizontal: 50, vertical: 70 } };

export interface Size {
  w: number;
  h: number;
}

/** Sizes to assume when the shapes have not been drawn (their real size depends on the label and the theme). */
export function estimateSize(shape: Shape): Size {
  switch (shape) {
    case 'diamond':
      return { w: 200, h: 84 };
    case 'circle':
      return { w: 96, h: 96 };
    case 'cylinder':
      return { w: 140, h: 72 };
    case 'hexagon':
    case 'parallelogram':
      return { w: 170, h: 48 };
    default:
      return { w: 140, h: 48 };
  }
}

/**
 * Arrange nodes in layers following the diagram direction. Deliberately simple: rank by longest path from the
 * roots, keep insertion order within a layer. Shapes are centred on a common line, using their real sizes when
 * `sizeOf` knows them, so a row of shapes of different sizes still lines up and straight arrows stay straight.
 */
export function autoLayout(diagram: Diagram, sizeOf?: (node: DiagramNode) => Size | null): void {
  const { nodes, edges } = diagram;
  if (!nodes.length) return;

  const out = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of nodes) {
    out.set(node.id, []);
    indegree.set(node.id, 0);
  }
  for (const edge of edges) {
    if (edge.from === edge.to || !out.has(edge.from) || !out.has(edge.to)) continue;
    out.get(edge.from)!.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const rank = new Map<string, number>();
  const onPath = new Set<string>();
  const visit = (id: string, depth: number): void => {
    if (onPath.has(id)) return; // a cycle: ignore the back edge
    if ((rank.get(id) ?? -1) >= depth) return;
    rank.set(id, depth);
    onPath.add(id);
    for (const next of out.get(id) ?? []) visit(next, depth + 1);
    onPath.delete(id);
  };
  for (const node of nodes) if (indegree.get(node.id) === 0) visit(node.id, 0);
  for (const node of nodes) if (!rank.has(node.id)) visit(node.id, 0);

  const layers: DiagramNode[][] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const node of nodes) {
    const r = rank.get(node.id) ?? 0;
    (layers[r] ??= []).push(byId.get(node.id)!);
  }
  const filled = layers.filter(Boolean);

  const horizontal = diagram.direction === 'LR' || diagram.direction === 'RL';
  const reversed = diagram.direction === 'BT' || diagram.direction === 'RL';
  const orientation = horizontal ? 'horizontal' : 'vertical';
  const along = GAP.along[orientation];
  const across = GAP.across[orientation];

  // Sizes along the flow (main) and across it (cross).
  const sizes = new Map<string, Size>();
  for (const node of nodes) sizes.set(node.id, sizeOf?.(node) ?? estimateSize(node.shape));
  const main = (n: DiagramNode): number => (horizontal ? sizes.get(n.id)!.w : sizes.get(n.id)!.h);
  const cross = (n: DiagramNode): number => (horizontal ? sizes.get(n.id)!.h : sizes.get(n.id)!.w);

  // How far each layer reaches across the flow, and the middle line they all centre on.
  const extents = filled.map((layer) => layer.reduce((sum, n) => sum + cross(n), 0) + (layer.length - 1) * across);
  const middle = MARGIN + Math.max(...extents) / 2;

  // Layers sit one after another along the flow; each shape is centred in its layer's column.
  const columns = filled.map((layer) => Math.max(...layer.map(main)));
  const total = columns.reduce((sum, w) => sum + w, 0) + (filled.length - 1) * along;
  let start = MARGIN;
  filled.forEach((layer, index) => {
    const column = columns[index];
    const columnStart = reversed ? MARGIN + total - (start - MARGIN) - column : start;
    let at = middle - extents[index] / 2;
    for (const node of layer) {
      const along0 = columnStart + (column - main(node)) / 2;
      const across0 = at;
      node.x = Math.round(horizontal ? along0 : across0);
      node.y = Math.round(horizontal ? across0 : along0);
      at += cross(node) + across;
    }
    start += column + along;
  });
}
