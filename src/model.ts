export type Direction = 'TD' | 'LR' | 'BT' | 'RL';

export type Shape =
  | 'rect'
  | 'rounded'
  | 'stadium'
  | 'diamond'
  | 'circle'
  | 'hexagon'
  | 'parallelogram'
  | 'cylinder'
  | 'subroutine';

export type LineStyle = 'solid' | 'dotted' | 'thick';
export type ArrowStyle = 'arrow' | 'none' | 'both';

export type TitleAlign = 'left' | 'center' | 'right';

export const TITLE_ALIGNS: { id: TitleAlign; name: string }[] = [
  { id: 'left', name: 'Left' },
  { id: 'center', name: 'Centre' },
  { id: 'right', name: 'Right' },
];

export interface DiagramNode {
  id: string;
  label: string;
  shape: Shape;
  x: number;
  y: number;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  line: LineStyle;
  arrow: ArrowStyle;
}

export interface Diagram {
  /** Shown above the diagram and used as its accessible name. Required to insert. */
  title: string;
  /** Optional longer description for screen-reader users. */
  description: string;
  /** Where the title sits above the diagram. */
  titleAlign: TitleAlign;
  direction: Direction;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface ShapeInfo {
  id: Shape;
  name: string;
  hint: string;
}

export const SHAPES: ShapeInfo[] = [
  { id: 'rect', name: 'Rectangle', hint: 'A step or process' },
  { id: 'rounded', name: 'Rounded', hint: 'A softer step' },
  { id: 'stadium', name: 'Pill', hint: 'A start or end point' },
  { id: 'diamond', name: 'Diamond', hint: 'A decision' },
  { id: 'circle', name: 'Circle', hint: 'A connector or event' },
  { id: 'hexagon', name: 'Hexagon', hint: 'A preparation step' },
  { id: 'parallelogram', name: 'Slanted', hint: 'Input or output' },
  { id: 'cylinder', name: 'Cylinder', hint: 'A database or store' },
  { id: 'subroutine', name: 'Subroutine', hint: 'A predefined process' },
];

export const DIRECTIONS: { id: Direction; name: string }[] = [
  { id: 'TD', name: 'Top to bottom' },
  { id: 'LR', name: 'Left to right' },
  { id: 'BT', name: 'Bottom to top' },
  { id: 'RL', name: 'Right to left' },
];

export const LINE_STYLES: { id: LineStyle; name: string }[] = [
  { id: 'solid', name: 'Solid' },
  { id: 'dotted', name: 'Dotted' },
  { id: 'thick', name: 'Thick' },
];

export const ARROW_STYLES: { id: ArrowStyle; name: string }[] = [
  { id: 'arrow', name: 'Arrow' },
  { id: 'both', name: 'Arrows both ways' },
  { id: 'none', name: 'No arrow' },
];

export function shapeName(shape: Shape): string {
  return SHAPES.find((s) => s.id === shape)?.name ?? shape;
}

export function emptyDiagram(): Diagram {
  return { title: '', description: '', titleAlign: 'center', direction: 'TD', nodes: [], edges: [] };
}

export function cloneDiagram(d: Diagram): Diagram {
  return JSON.parse(JSON.stringify(d)) as Diagram;
}

/** Next free id with the given prefix, e.g. n1, n2, … */
export function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let i = 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/** A single-line version of a label, for lists and announcements. */
export function plainLabel(label: string, fallback = 'Untitled'): string {
  const text = label.replace(/\s+/g, ' ').trim();
  return text || fallback;
}
