import { parse } from 'pele';
import type { ArrowStyle, Diagram, DiagramEdge, DiagramNode, Direction, LineStyle, Shape, TitleAlign } from './model';
import { autoLayout } from './layout';

/** Comment line that carries canvas positions so a diagram reopens as it was left. */
const META_PREFIX = '%% volcanic:';

const SHAPE_WRAP: Record<Shape, [string, string]> = {
  rect: ['[', ']'],
  rounded: ['(', ')'],
  stadium: ['([', '])'],
  diamond: ['{', '}'],
  circle: ['((', '))'],
  hexagon: ['{{', '}}'],
  parallelogram: ['[/', '/]'],
  cylinder: ['[(', ')]'],
  subroutine: ['[[', ']]'],
};

const PELE_SHAPES: Record<string, Shape> = {
  square: 'rect',
  rect: 'rect',
  round: 'rounded',
  stadium: 'stadium',
  diamond: 'diamond',
  circle: 'circle',
  hexagon: 'hexagon',
  lean_right: 'parallelogram',
  cylinder: 'cylinder',
  subroutine: 'subroutine',
};

const ARROWS: Record<LineStyle, Record<ArrowStyle, string>> = {
  solid: { arrow: '-->', none: '---', both: '<-->' },
  dotted: { arrow: '-.->', none: '-.-', both: '<-.->' },
  thick: { arrow: '==>', none: '===', both: '<==>' },
};

function quote(label: string): string {
  const text = label
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/\r?\n/g, '<br/>');
  return `"${text.trim() === '' ? ' ' : text}"`;
}

function unquote(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    // Pele keeps entities as placeholders: ﬂ°quot¶ß for #quot; and ﬂ°°35¶ß for #35;
    .replace(/ﬂ°°(\d+)¶ß/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/ﬂ°(\w+)¶ß/g, (_, name: string) => ({ quot: '"', amp: '&', lt: '<', gt: '>' }[name] ?? ''))
    .trim();
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export const FRONT_MATTER = /^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function unquoteYaml(value: string): string {
  const text = value.trim();
  if (text.startsWith('"')) {
    try {
      return String(JSON.parse(text));
    } catch {
      return text.replace(/^"|"$/g, '');
    }
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length > 1) return text.slice(1, -1).replace(/''/g, "'");
  return text;
}

/** The title of any Mermaid diagram: its front matter title, or failing that its accTitle. */
export function readTitle(source: string): string {
  const front = FRONT_MATTER.exec(source);
  const line = front?.[1].split(/\r?\n/).find((l) => /^title\s*:/.test(l));
  if (line) return unquoteYaml(line.replace(/^title\s*:/, ''));
  // Gantt, pie and other types can carry the title on a line of their own.
  const inline = /^[ \t]*title[ \t]+(\S.*)$/m.exec(front ? source.slice(front[0].length) : source);
  if (inline) return inline[1].trim();
  const acc = /^[ \t]*accTitle[ \t]*:[ \t]*(.+)$/m.exec(source);
  return acc ? acc[1].trim() : '';
}

/** Set (or with an empty title, remove) the front matter title of any Mermaid diagram. */
export function setTitle(source: string, title: string): string {
  const text = oneLine(title);
  const entry = text ? `title: ${JSON.stringify(text)}` : null;
  const front = FRONT_MATTER.exec(source);
  if (!front?.[1].split(/\r?\n/).some((l) => /^title\s*:/.test(l)) && /^[ \t]*title[ \t]+\S/m.test(source)) {
    // The title lives on its own line (Gantt, pie...): change it there instead of adding a second one.
    return text ? source.replace(/^([ \t]*)title[ \t]+\S.*$/m, `$1title ${text.replace(/\$/g, '$$$$')}`) : source.replace(/^[ \t]*title[ \t]+\S.*\r?\n?/m, '');
  }
  if (!front) return entry ? `---\n${entry}\n---\n${source.replace(/^\s+/, '')}` : source;
  const rest = source.slice(front[0].length);
  const kept = front[1].split(/\r?\n/).filter((l) => !/^title\s*:/.test(l));
  const lines = entry ? [entry, ...kept] : kept;
  return lines.some((l) => l.trim()) ? `---\n${lines.join('\n')}\n---\n${rest}` : rest;
}

/** Mermaid source for a diagram. `withPositions` appends the layout comment. */
export function toMermaid(diagram: Diagram, withPositions = true): string {
  const lines: string[] = [];
  const title = oneLine(diagram.title);
  const description = oneLine(diagram.description);
  // The front matter title is drawn above the diagram; accTitle/accDescr name it for screen readers.
  if (title) lines.push('---', `title: ${JSON.stringify(title)}`, '---');
  lines.push(`flowchart ${diagram.direction}`);
  if (title) lines.push(`    accTitle: ${title}`);
  if (description) lines.push(`    accDescr: ${description}`);
  for (const node of diagram.nodes) {
    const [open, close] = SHAPE_WRAP[node.shape];
    lines.push(`    ${node.id}${open}${quote(node.label)}${close}`);
  }
  for (const edge of diagram.edges) {
    const arrow = ARROWS[edge.line][edge.arrow];
    const label = edge.label.trim() ? `|${quote(edge.label)}|` : '';
    lines.push(`    ${edge.from} ${arrow}${label} ${edge.to}`);
  }
  if (withPositions && diagram.nodes.length) {
    const pos: Record<string, [number, number]> = {};
    for (const node of diagram.nodes) pos[node.id] = [Math.round(node.x), Math.round(node.y)];
    const meta: Meta = { v: 1, pos };
    if (diagram.titleAlign !== 'center') meta.titleAlign = diagram.titleAlign;
    lines.push(`${META_PREFIX}${JSON.stringify(meta)}`);
  }
  return lines.join('\n');
}

interface Meta {
  v: number;
  pos?: Record<string, [number, number]>;
  titleAlign?: TitleAlign;
  theme?: string;
  /** A description for diagrams whose syntax has no accDescr line (Pele's mind map rejects it). */
  desc?: string;
  /** Text size in pixels (Pele's own is 16); absent for the default. */
  fs?: number;
  /** Extra details for Gantt tasks, by task id: who it is assigned to and how far along it is. */
  tasks?: Record<string, { a?: string; p?: number }>;
  /** Where a Gantt chart takes its public holidays from: an ISO country code and an optional region code. */
  holidays?: { c: string; r?: string; i?: number } | { c: string; r?: string; i?: number }[];
}

function readMeta(source: string): Meta {
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(META_PREFIX)) continue;
    try {
      const meta = JSON.parse(trimmed.slice(META_PREFIX.length)) as Meta | null;
      if (meta && typeof meta === 'object') return meta;
    } catch {
      // A damaged comment only costs the saved layout.
    }
  }
  return { v: 1 };
}

function readPositions(source: string): Record<string, [number, number]> {
  const pos = readMeta(source).pos;
  return pos && typeof pos === 'object' ? pos : {};
}

function writeMeta(source: string, meta: Meta): string {
  const body = stripMeta(source).replace(/\s+$/, '');
  const empty = !meta.pos && !meta.titleAlign && !meta.theme && !meta.fs && !meta.desc && !meta.holidays && !(meta.tasks && Object.keys(meta.tasks).length);
  return empty || !body ? body : `${body}\n${META_PREFIX}${JSON.stringify(meta)}`;
}

/** Where the title of any diagram should sit. Centre unless Volcanic's comment says otherwise. */
export function readTitleAlign(source: string): TitleAlign {
  const align = readMeta(source).titleAlign;
  return align === 'left' || align === 'right' ? align : 'center';
}

/** Record the title position in Volcanic's comment, adding or removing the comment as needed. */
export function setTitleAlign(source: string, align: TitleAlign): string {
  const meta = readMeta(source);
  if (align === 'center') delete meta.titleAlign;
  else meta.titleAlign = align;
  return writeMeta(source, meta);
}

/** The colour theme chosen for a diagram, or '' to use the default from settings. */
export function readTheme(source: string): string {
  const theme = readMeta(source).theme;
  return typeof theme === 'string' && /^[a-z-]{1,24}$/.test(theme) ? theme : '';
}

/** Record the colour theme in Volcanic's comment. An empty theme removes it. */
export function setTheme(source: string, theme: string): string {
  const meta = readMeta(source);
  if (theme) meta.theme = theme;
  else delete meta.theme;
  return writeMeta(source, meta);
}

export type ImportResult =
  | { ok: true; diagram: Diagram }
  | { ok: false; reason: string };

/**
 * Turn Mermaid source into an editable diagram. Anything the visual editor
 * cannot represent is refused rather than silently dropped, so the caller can
 * fall back to editing the source as text.
 */
export function fromMermaid(source: string): ImportResult {
  let model: ReturnType<typeof parse>;
  try {
    model = parse(source);
  } catch (error) {
    const line = (error as { line?: number } | null)?.line;
    return { ok: false, reason: line ? `There is a syntax error on line ${line}.` : 'The source could not be read as a diagram.' };
  }
  if (model.type !== 'flowchart') {
    return { ok: false, reason: 'Only flowcharts can be edited visually.' };
  }
  if (model.subgraphs.length) return { ok: false, reason: 'This flowchart uses subgraphs.' };
  if (model.classes.size) return { ok: false, reason: 'This flowchart uses custom style classes.' };
  if (model.tooltips.size) return { ok: false, reason: 'This flowchart uses tooltips.' };

  const direction = (model.direction === 'TB' ? 'TD' : model.direction) ?? 'TD';
  if (!['TD', 'LR', 'BT', 'RL'].includes(direction)) {
    return { ok: false, reason: `Direction "${direction}" is not supported.` };
  }

  const positions = readPositions(source);
  const nodes: DiagramNode[] = [];
  let needsLayout = false;
  for (const node of model.nodes.values()) {
    const shape = node.type === undefined ? 'rect' : PELE_SHAPES[node.type];
    if (!shape) return { ok: false, reason: `Shape "${node.type}" is not supported.` };
    if (node.styles.length || node.classes.length || node.link || node.icon || node.img || node.form) {
      return { ok: false, reason: 'This flowchart uses styling, links or icons.' };
    }
    if (node.labelType === 'markdown') return { ok: false, reason: 'This flowchart uses Markdown labels.' };
    const pos = positions[node.id];
    const valid = Array.isArray(pos) && Number.isFinite(pos[0]) && Number.isFinite(pos[1]);
    if (!valid) needsLayout = true;
    nodes.push({
      id: node.id,
      label: unquote(node.text ?? node.id),
      shape,
      x: valid ? Math.max(0, pos[0]) : 0,
      y: valid ? Math.max(0, pos[1]) : 0,
    });
  }

  const edges: DiagramEdge[] = [];
  for (const edge of model.edges) {
    const arrow: ArrowStyle | undefined =
      edge.type === 'arrow_point' ? 'arrow' : edge.type === 'arrow_open' ? 'none' : edge.type === 'double_arrow_point' ? 'both' : undefined;
    if (!arrow) return { ok: false, reason: 'This flowchart uses an arrow type that is not supported.' };
    const line: LineStyle | undefined =
      edge.stroke === 'normal' || edge.stroke === undefined ? 'solid' : edge.stroke === 'dotted' ? 'dotted' : edge.stroke === 'thick' ? 'thick' : undefined;
    if (!line) return { ok: false, reason: 'This flowchart uses a line type that is not supported.' };
    if (edge.style?.length || edge.classes.length || edge.animate || edge.labelType === 'markdown') {
      return { ok: false, reason: 'This flowchart uses styled connections.' };
    }
    edges.push({ id: `e${edges.length + 1}`, from: edge.start, to: edge.end, label: unquote(edge.text), line, arrow });
  }

  const diagram: Diagram = {
    title: oneLine(model.title ?? model.accTitle ?? ''),
    description: oneLine(model.accDescr ?? ''),
    titleAlign: readTitleAlign(source),
    direction: direction as Direction,
    nodes,
    edges,
  };
  if (needsLayout) autoLayout(diagram);
  return { ok: true, diagram };
}

/** The Mermaid source without Volcanic's layout comment. */
export function stripMeta(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(META_PREFIX))
    .join('\n');
}

export interface Template {
  id: string;
  name: string;
  source: string;
}

/** Starters for diagram types that are edited as text with a live preview. */
export const TEMPLATES: Template[] = [
  {
    id: 'sequence',
    name: 'Sequence diagram',
    source: 'sequenceDiagram\n    participant A as Alice\n    participant B as Bob\n    A->>B: Hello Bob\n    B-->>A: Hi Alice',
  },
  {
    id: 'class',
    name: 'Class diagram',
    source: 'classDiagram\n    class Animal {\n        +String name\n        +speak()\n    }\n    class Dog\n    Animal <|-- Dog',
  },
  {
    id: 'state',
    name: 'State diagram',
    source: 'stateDiagram-v2\n    [*] --> Idle\n    Idle --> Running: start\n    Running --> Idle: stop\n    Running --> [*]',
  },
  {
    id: 'er',
    name: 'Entity relationship diagram',
    source: 'erDiagram\n    CUSTOMER ||--o{ ORDER : places\n    ORDER ||--|{ LINE_ITEM : contains',
  },
  {
    id: 'gantt',
    name: 'Gantt chart',
    source: 'gantt\n    title Project plan\n    dateFormat YYYY-MM-DD\n    section Design\n    Research :a1, 2026-01-05, 7d\n    Mockups  :after a1, 5d\n    section Build\n    Develop  :2026-01-19, 10d',
  },
  {
    id: 'pie',
    name: 'Pie chart',
    source: 'pie title Favourite fruit\n    "Apples" : 45\n    "Bananas" : 30\n    "Cherries" : 25',
  },
  {
    id: 'mindmap',
    name: 'Mind map',
    source: 'mindmap\n  root((Topic))\n    Idea one\n      Detail\n    Idea two\n    Idea three',
  },
  {
    id: 'timeline',
    name: 'Timeline',
    source: 'timeline\n    title History\n    2022 : First idea\n    2024 : Prototype\n    2026 : Release',
  },
  {
    id: 'flowchart',
    name: 'Flowchart',
    source: 'flowchart TD\n    A([Start]) --> B{Is it ready?}\n    B -->|Yes| C[Ship it]\n    B -->|No| D[(Check the logs)]\n    D --> B',
  },
  {
    id: 'journey',
    name: 'User journey',
    source: 'journey\n    title My working day\n    section Morning\n      Make tea: 5: Me\n      Check the news: 3: Me\n    section Afternoon\n      Write the report: 2: Me, Cat\n      Send it: 4: Me',
  },
  {
    id: 'quadrant',
    name: 'Quadrant chart',
    source: 'quadrantChart\n  title Reach and engagement\n  x-axis Low reach --> High reach\n  y-axis Low engagement --> High engagement\n  quadrant-1 Expand\n  quadrant-2 Promote\n  quadrant-3 Re-evaluate\n  quadrant-4 Improve\n  Campaign A: [0.3, 0.6]\n  Campaign B: [0.45, 0.23]\n  Campaign C: [0.57, 0.69]\n  Campaign D: [0.78, 0.34]',
  },
  {
    id: 'kanban',
    name: 'Kanban board',
    source: 'kanban\n  todo[To do]\n    t1[Write the spec]\n    t2[Draw the screens]\n  doing[In progress]\n    t3[Build the editor]\n  done[Done]\n    t4[Set up the project]',
  },
  {
    id: 'git',
    name: 'Git graph',
    source: 'gitGraph\n  commit\n  commit\n  branch feature\n  checkout feature\n  commit\n  commit\n  checkout main\n  merge feature\n  commit',
  },
  {
    id: 'requirement',
    name: 'Requirement diagram',
    source: 'requirementDiagram\n  requirement test_req {\n    id: 1\n    text: the test text.\n    risk: high\n    verifymethod: test\n  }\n  element test_entity {\n    type: simulation\n  }\n  test_entity - satisfies -> test_req',
  },
  {
    id: 'architecture',
    name: 'Architecture diagram',
    source: 'architecture-beta\n  group api(cloud)[API]\n  service db(database)[Database] in api\n  service server(server)[Server] in api\n  service disk(disk)[Storage] in api\n  db:L -- R:server\n  disk:T -- B:server',
  },
  {
    id: 'xychart',
    name: 'XY chart',
    source: 'xychart-beta\n  x-axis [jan, feb, mar, apr, may]\n  y-axis "Revenue" 0 --> 100\n  bar [30, 50, 80, 60, 90]\n  line [30, 50, 80, 60, 90]',
  },
  {
    id: 'sankey',
    name: 'Sankey diagram',
    source: 'sankey-beta\n\nEnergy,Home,40\nEnergy,Industry,60\nHome,Heating,25\nHome,Lighting,15\nIndustry,Machines,45\nIndustry,Transport,15',
  },
  {
    id: 'radar',
    name: 'Radar chart',
    source: 'radar-beta\n  title Skills\n  axis d["Design"], c["Code"], t["Test"], w["Docs"], o["Ops"]\n  curve a["Alice"]{4, 3, 2, 5, 1}\n  curve b["Bob"]{2, 5, 4, 1, 3}\n  max 5',
  },
  {
    id: 'treemap',
    name: 'Treemap',
    source: 'treemap-beta\n"Company"\n  "Engineering": 40\n  "Sales": 25\n  "Support": 15\n  "Design": 12',
  },
  {
    id: 'packet',
    name: 'Packet diagram',
    source: 'packet-beta\n  0-15: "Source port"\n  16-31: "Destination port"\n  32-63: "Sequence number"\n  64-95: "Acknowledgment number"',
  },
  {
    id: 'block',
    name: 'Block diagram',
    source: 'block-beta\n  columns 3\n  a["Frontend"] b["API"] c["Database"]\n  a --> b\n  b --> c',
  },
  {
    id: 'c4',
    name: 'C4 context diagram',
    source: 'C4Context\n  title System context\n  Person(user, "User", "Uses the app")\n  System(app, "Web app", "Does the work")\n  System_Ext(mail, "Email", "Sends messages")\n  Rel(user, app, "Uses")\n  Rel(app, mail, "Sends email")',
  },
];

export interface TaskDetails {
  assignee: string;
  progress: number;
}

/** Who each Gantt task is assigned to and how far along it is, by task id. */
export function readTaskDetails(source: string): Record<string, TaskDetails> {
  const raw = readMeta(source).tasks;
  const out: Record<string, TaskDetails> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    const assignee = typeof value.a === 'string' ? value.a.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    const progress = typeof value.p === 'number' && Number.isFinite(value.p) ? Math.min(100, Math.max(0, Math.round(value.p))) : 0;
    if (assignee || progress) out[id] = { assignee, progress };
  }
  return out;
}

/** Record task details in Volcanic's comment. Tasks with nothing to say are left out. */
export function setTaskDetails(source: string, details: Record<string, TaskDetails>): string {
  const meta = readMeta(source);
  const tasks: Record<string, { a?: string; p?: number }> = {};
  for (const [id, d] of Object.entries(details)) {
    const assignee = d.assignee.replace(/\s+/g, ' ').trim().slice(0, 60);
    const progress = Math.min(100, Math.max(0, Math.round(d.progress)));
    if (!assignee && !progress) continue;
    tasks[id] = {};
    if (assignee) tasks[id].a = assignee;
    if (progress) tasks[id].p = progress;
  }
  if (Object.keys(tasks).length) meta.tasks = tasks;
  else delete meta.tasks;
  return writeMeta(source, meta);
}

export interface HolidayPlace {
  country: string;
  region: string;
  include: 0 | 1 | 2;
}

/** The places (country, optional region) whose holidays a chart shows. Older charts stored just one. */
export function readHolidayPlaces(source: string): HolidayPlace[] {
  const raw = readMeta(source).holidays;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const out: HolidayPlace[] = [];
  for (const value of list) {
    if (!value || typeof value !== 'object') continue;
    const country = typeof value.c === 'string' && /^[A-Z]{2}$/.test(value.c) ? value.c : '';
    if (!country) continue;
    const region = typeof value.r === 'string' && /^[A-Za-z0-9-]{1,8}$/.test(value.r) ? value.r : '';
    out.push({ country, region, include: value.i === 1 || value.i === 2 ? value.i : 0 });
    if (out.length >= 12) break;
  }
  return out;
}

export function setHolidayPlaces(source: string, places: { country: string; region: string; include?: 0 | 1 | 2 }[]): string {
  const meta = readMeta(source);
  const list = places
    .filter((p) => p.country)
    .map((p) => {
      const entry: { c: string; r?: string; i?: number } = { c: p.country };
      if (p.region) entry.r = p.region;
      if (p.include) entry.i = p.include;
      return entry;
    });
  if (list.length) meta.holidays = list;
  else delete meta.holidays;
  return writeMeta(source, meta);
}

/** Text sizes offered for a diagram, in pixels. Pele's own size is 16. */
export const TEXT_SIZES: { id: string; name: string }[] = [
  { id: '', name: 'Default' },
  { id: '12', name: 'Small (12)' },
  { id: '14', name: 'Medium (14)' },
  { id: '18', name: 'Large (18)' },
  { id: '20', name: 'Larger (20)' },
  { id: '24', name: 'Extra large (24)' },
  { id: '28', name: 'Huge (28)' },
];

/** The text size chosen for a diagram, in pixels, or 0 to use the default. */
export function readFontSize(source: string): number {
  const size = readMeta(source).fs;
  return typeof size === 'number' && Number.isFinite(size) && size >= 8 && size <= 40 ? Math.round(size) : 0;
}

export function setFontSize(source: string, size: number): string {
  const meta = readMeta(source);
  if (size >= 8 && size <= 40) meta.fs = Math.round(size);
  else delete meta.fs;
  return writeMeta(source, meta);
}

/** A description kept in Volcanic's comment, for diagram types that cannot carry an accDescr line. */
export function readMetaDescription(source: string): string {
  const value = readMeta(source).desc;
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
}

export function setMetaDescription(source: string, description: string): string {
  const meta = readMeta(source);
  const text = description.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (text) meta.desc = text;
  else delete meta.desc;
  return writeMeta(source, meta);
}
