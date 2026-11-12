import { detectType, mount, type Mounted } from 'pele';
import { createTabs, h, nodeOutline, s, setAttrs, shapeIcon, uniqueId, type Tabs } from './dom';
import { autoLayout } from './layout';
import { fromMermaid, readFontSize, readTheme, readTitle, readTitleAlign, setFontSize, setTheme, setTitle, setTitleAlign, stripMeta, TEMPLATES, TEXT_SIZES, toMermaid } from './mermaid';
import { DEFAULT_THEME_ID, NO_THEME_ATTR, THEMES, swatchColours, themeById } from './themes';
import { swatchSelect, type SwatchOption, type SwatchSelect } from './ui';
import { alignTitle } from './title';
import { setDescription } from './description';
import { setTaskDetails } from './taskDetails';
import { setHolidayBands } from './holidayBands';
import { GanttEditor } from './ganttEditor';
import { MindMapEditor } from './mindEditor';
import { JourneyEditor } from './journeyEditor';
import { PieEditor } from './pieEditor';
import { pieFromMermaid, starterPie, type Pie } from './pie';
import { RadarEditor } from './radarEditor';
import { QuadrantEditor } from './quadrantEditor';
import { TimelineEditor } from './timelineEditor';
import { XyChartEditor } from './xychartEditor';
import { KanbanEditor } from './kanbanEditor';
import { SankeyEditor } from './sankeyEditor';
import { TreemapEditor } from './treemapEditor';
import { PacketEditor } from './packetEditor';
import { StateEditor } from './stateEditor';
import { ErEditor } from './erEditor';
import { ClassEditor } from './classEditor';
import { ArchitectureEditor } from './architectureEditor';
import { BlockEditor } from './blockEditor';
import { GitEditor } from './gitEditor';
import { RequirementEditor } from './requirementEditor';
import { packetFromMermaid, starterPacket, type Packet } from './packet';
import { requirementFromMermaid, starterRequirements, type RequirementDiagram } from './requirement';
import { gitFromMermaid, starterGit, type GitGraph } from './gitGraph';
import { blockFromMermaid, starterBlocks, type BlockDiagram } from './block';
import { architectureFromMermaid, starterArchitecture, type Architecture } from './architecture';
import { classFromMermaid, starterClasses, type ClassDiagram } from './classDiagram';
import { erFromMermaid, starterEr, type ErDiagram } from './er';
import { stateFromMermaid, starterState, type StateDiagram } from './state';
import { treemapFromMermaid, starterTreemap, type Treemap } from './treemap';
import { sankeyFromMermaid, starterSankey, type Sankey } from './sankey';
import { kanbanFromMermaid, starterKanban, type Kanban } from './kanban';
import { xyChartFromMermaid, starterXyChart, type XyChart } from './xychart';
import { timelineFromMermaid, starterTimeline, type Timeline } from './timeline';
import { quadrantFromMermaid, starterQuadrant, type Quadrant } from './quadrant';
import { radarFromMermaid, starterRadar, type Radar } from './radar';
import { journeyFromMermaid, starterJourney, type Journey } from './journey';
import { mindFromMermaid, starterMindMap, type MindMap } from './mindmap';
import { ganttFromMermaid, starterGantt, type GanttDiagram } from './gantt';
import { readDescription, type Kind, type KindEditor, type KindHost } from './kinds';
import { SequenceEditor } from './seqEditor';
import { seqFromMermaid, starterSequence, type SeqDiagram } from './sequence';
import { placeEdgeLabels } from './labels';
import {
  ARROW_STYLES,
  DIRECTIONS,
  LINE_STYLES,
  SHAPES,
  TITLE_ALIGNS,
  emptyDiagram,
  nextId,
  plainLabel,
  shapeName,
  type ArrowStyle,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type Direction,
  type LineStyle,
  type Shape,
  type TitleAlign,
} from './model';

export interface EditorHost {
  /** Put a named icon inside an element (Obsidian's setIcon). */
  setIcon(el: HTMLElement, icon: string): void;
  onSubmit(source: string): void;
  onCancel(): void;
  submitLabel: string;
  /** Shown inside the note rather than in a pop-up window: Escape leaves it. */
  inline?: boolean;
  /** Draw connection labels beside their lines rather than on top of them. */
  labelsBesideLines: boolean;
  /** The colour theme for diagrams that have not chosen one ('' follows Obsidian). */
  defaultTheme?: string;
  /** Text size for diagrams that have not chosen one (0 for Pele's own). */
  defaultFontSize?: number;
  /** Open in Code mode, so the Mermaid source is what you see first. */
  startInCode?: boolean;
}

type Selection = { kind: 'node' | 'edge'; id: string } | null;

interface Meta {
  title: string;
  description: string;
  titleAlign: TitleAlign;
}

type Loaded =
  | { ok: true; kind: 'flowchart'; diagram: Diagram }
  | ({ ok: true; kind: 'sequence'; diagram: SeqDiagram } & Meta)
  | ({ ok: true; kind: 'gantt'; diagram: GanttDiagram } & Meta)
  | ({ ok: true; kind: 'mindmap'; map: MindMap } & Meta)
  | ({ ok: true; kind: 'journey'; journey: Journey } & Meta)
  | ({ ok: true; kind: 'pie'; pie: Pie } & Meta)
  | ({ ok: true; kind: 'radar'; radar: Radar } & Meta)
  | ({ ok: true; kind: 'quadrant'; quadrant: Quadrant } & Meta)
  | ({ ok: true; kind: 'timeline'; timeline: Timeline } & Meta)
  | ({ ok: true; kind: 'xychart'; chart: XyChart } & Meta)
  | ({ ok: true; kind: 'kanban'; kanban: Kanban } & Meta)
  | ({ ok: true; kind: 'sankey'; sankey: Sankey } & Meta)
  | ({ ok: true; kind: 'treemap'; treemap: Treemap } & Meta)
  | ({ ok: true; kind: 'packet'; packet: Packet } & Meta)
  | ({ ok: true; kind: 'state'; state: StateDiagram } & Meta)
  | ({ ok: true; kind: 'er'; er: ErDiagram } & Meta)
  | ({ ok: true; kind: 'class'; classes: ClassDiagram } & Meta)
  | ({ ok: true; kind: 'architecture'; architecture: Architecture } & Meta)
  | ({ ok: true; kind: 'block'; block: BlockDiagram } & Meta)
  | ({ ok: true; kind: 'git'; git: GitGraph } & Meta)
  | ({ ok: true; kind: 'requirement'; requirement: RequirementDiagram } & Meta)
  | { ok: false; reason: string };

const KINDS: { id: Kind; name: string }[] = [
  { id: 'flowchart', name: 'Flowchart' },
  { id: 'sequence', name: 'Sequence diagram' },
  { id: 'gantt', name: 'Gantt chart' },
  { id: 'mindmap', name: 'Mind map' },
  { id: 'journey', name: 'User journey' },
  { id: 'pie', name: 'Pie chart' },
  { id: 'radar', name: 'Radar chart' },
  { id: 'quadrant', name: 'Quadrant chart' },
  { id: 'timeline', name: 'Timeline' },
  { id: 'xychart', name: 'XY chart' },
  { id: 'kanban', name: 'Kanban board' },
  { id: 'sankey', name: 'Sankey diagram' },
  { id: 'treemap', name: 'Treemap' },
  { id: 'packet', name: 'Packet diagram' },
  { id: 'state', name: 'State diagram' },
  { id: 'er', name: 'Entity relationship diagram' },
  { id: 'class', name: 'Class diagram' },
  { id: 'architecture', name: 'Architecture diagram' },
  { id: 'block', name: 'Block diagram' },
  { id: 'git', name: 'Git graph' },
  { id: 'requirement', name: 'Requirement diagram' },
];
type Mode = 'visual' | 'code';

const GRID = 10;
/** How close (px) an edge or centre must be to another shape's before it snaps. */
const ALIGN_DISTANCE = 7;

interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
const DEFAULT_LABELS: Partial<Record<Shape, string>> = {
  stadium: 'Start',
  diamond: 'Decision',
  cylinder: 'Database',
  parallelogram: 'Input',
};

const snap = (value: number): number => Math.max(0, Math.round(value / GRID) * GRID);

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
}

export class DiagramEditor {
  private mode: Mode = 'visual';
  private diagram: Diagram = emptyDiagram();
  private codeText = '';
  private codeReason = '';
  /** A title typed before there was any source to hold it. */
  private pendingTitle = '';
  private selection: Selection = null;
  private readonly initialSource: string;

  private history: string[] = [];
  private historyIndex = -1;
  private lastTag = '';
  private lastCommit = 0;

  private connectArmed = false;
  private connectFrom: string | null = null;
  private inlineEdit: { id: string; field: HTMLTextAreaElement } | null = null;

  private readonly uid = uniqueId('volcanic');
  private readonly nodeEls = new Map<string, HTMLElement>();
  private mounted: Mounted | null = null;
  private previewTimer = 0;
  private resizeObserver: ResizeObserver | null = null;
  private suppressClick = false;

  // Elements
  private root!: HTMLElement;
  private wrap!: HTMLElement;
  private canvas!: HTMLElement;
  private edgeLayer!: SVGSVGElement;
  private edgeGroup!: SVGGElement;
  private dragLine!: SVGPathElement;
  private guideGroup!: SVGGElement;
  private emptyState!: HTMLElement;
  private connectBanner!: HTMLElement;
  private inspector!: HTMLElement;
  private outline!: HTMLElement;
  private codeView!: HTMLElement;
  private codeField!: HTMLTextAreaElement;
  private codeNotice!: HTMLElement;
  private previewHost!: HTMLElement;
  private previewMessage!: HTMLElement;
  private status!: HTMLElement;
  private undoButton!: HTMLButtonElement;
  private redoButton!: HTMLButtonElement;
  private connectButton!: HTMLButtonElement;
  private directionSelect!: HTMLSelectElement;
  private modeButtons = new Map<Mode, HTMLButtonElement>();
  private sideTabs!: Tabs;
  private outputTabs!: Tabs;
  private firstPaletteButton!: HTMLButtonElement;
  private titleField!: HTMLInputElement;
  private titleError!: HTMLElement;
  private descriptionField!: HTMLInputElement;
  private titleAlignSelect!: HTMLSelectElement;
  /** The diagram's own colour theme. Empty means "use the default". */
  private theme = '';
  /** The diagram's own text size in pixels, or 0 for the default. */
  private fontSize = 0;
  private fontSelect!: HTMLSelectElement;
  private previewPanel!: HTMLElement;
  private themePicker!: SwatchSelect;
  private themeHint!: HTMLElement;
  private kind: Kind = 'flowchart';
  private kindEditor: KindEditor | null = null;
  private kindHost!: HTMLElement;
  private kindSelect!: HTMLSelectElement;
  private kindField!: HTMLElement;
  /** True when opened without any source, so the diagram type can still be chosen. */
  private readonly isNew: boolean;

  constructor(container: HTMLElement, private readonly host: EditorHost, source: string | null) {
    const trimmed = source?.trim() ?? '';
    this.isNew = !trimmed;
    this.theme = trimmed ? readTheme(trimmed) : '';
    this.fontSize = trimmed ? readFontSize(trimmed) : 0;
    let loaded: Loaded | null = null;
    if (trimmed) {
      const result = this.load(trimmed);
      if (!result.ok) {
        this.mode = 'code';
        this.codeText = trimmed;
        this.codeReason = result.reason;
      } else if (result.kind === 'flowchart') this.diagram = result.diagram;
      else loaded = result;
      if (result.ok && host.startInCode) {
        this.mode = 'code';
        this.codeText = trimmed;
      }
    }
    this.build(container);
    if (loaded) this.mountKind(loaded.kind, loaded);
    this.initialSource = this.getSource();
    this.commit();
    this.renderAll();
    this.applyMode();
  }

  // ───────────────────────────── Public API ─────────────────────────────

  getSource(): string {
    const source = this.buildSource();
    return source ? setFontSize(setTheme(source, this.theme), this.fontSize) : source;
  }

  private buildSource(): string {
    if (this.mode !== 'visual') return this.codeText.trim();
    if (this.kind !== 'flowchart') return this.kindSource();
    return this.diagram.nodes.length ? toMermaid(this.diagram) : '';
  }

  /** Work out which visual editor can hold this source, or why none can. */
  private load(text: string): Loaded {
    const type = detectType(text);
    if (type === 'sequence') {
      const result = seqFromMermaid(text);
      return result.ok ? { ...result, kind: 'sequence' } : result;
    }
    if (type === 'journey') {
      const result = journeyFromMermaid(text);
      return result.ok ? { ...result, kind: 'journey' } : result;
    }
    if (type === 'pie') {
      const result = pieFromMermaid(text);
      return result.ok ? { ...result, kind: 'pie' } : result;
    }
    if (type === 'requirement') {
      const result = requirementFromMermaid(text);
      return result.ok ? { ...result, kind: 'requirement', requirement: result.diagram } : result;
    }
    if (type === 'gitGraph') {
      const result = gitFromMermaid(text);
      return result.ok ? { ...result, kind: 'git', git: result.graph } : result;
    }
    if (type === 'block') {
      const result = blockFromMermaid(text);
      return result.ok ? { ...result, kind: 'block', block: result.diagram } : result;
    }
    if (type === 'architecture') {
      const result = architectureFromMermaid(text);
      return result.ok ? { ...result, kind: 'architecture' } : result;
    }
    if (type === 'class') {
      const result = classFromMermaid(text);
      return result.ok ? { ...result, kind: 'class', classes: result.diagram } : result;
    }
    if (type === 'er') {
      const result = erFromMermaid(text);
      return result.ok ? { ...result, kind: 'er', er: result.diagram } : result;
    }
    if (type === 'state') {
      const result = stateFromMermaid(text);
      return result.ok ? { ...result, kind: 'state', state: result.diagram } : result;
    }
    if (type === 'packet') {
      const result = packetFromMermaid(text);
      return result.ok ? { ...result, kind: 'packet' } : result;
    }
    if (type === 'treemap') {
      const result = treemapFromMermaid(text);
      return result.ok ? { ...result, kind: 'treemap' } : result;
    }
    if (type === 'sankey') {
      const result = sankeyFromMermaid(text);
      return result.ok ? { ...result, kind: 'sankey' } : result;
    }
    if (type === 'kanban') {
      const result = kanbanFromMermaid(text);
      return result.ok ? { ...result, kind: 'kanban' } : result;
    }
    if (type === 'xychart') {
      const result = xyChartFromMermaid(text);
      return result.ok ? { ...result, kind: 'xychart' } : result;
    }
    if (type === 'timeline') {
      const result = timelineFromMermaid(text);
      return result.ok ? { ...result, kind: 'timeline' } : result;
    }
    if (type === 'quadrantChart') {
      const result = quadrantFromMermaid(text);
      return result.ok ? { ...result, kind: 'quadrant' } : result;
    }
    if (type === 'radar') {
      const result = radarFromMermaid(text);
      return result.ok ? { ...result, kind: 'radar' } : result;
    }
    if (type === 'mindmap') {
      const result = mindFromMermaid(text);
      return result.ok ? { ...result, kind: 'mindmap' } : result;
    }
    if (type === 'gantt') {
      const result = ganttFromMermaid(text);
      return result.ok ? { ...result, kind: 'gantt' } : result;
    }
    const result = fromMermaid(text);
    return result.ok ? { ok: true, kind: 'flowchart', diagram: result.diagram } : result;
  }

  private kindSource(): string {
    if (!this.kindEditor) return '';
    const source = this.kindEditor.source({ title: this.titleField.value, description: this.descriptionField.value });
    return source ? setTitleAlign(source, this.titleAlignSelect.value as TitleAlign) : '';
  }

  private kindApi(): KindHost {
    return {
      setIcon: this.host.setIcon,
      announce: (message) => this.announce(message),
      changed: () => {
        this.renderOutput();
        this.renderToolbarState();
      },
    };
  }

  /** Show the visual editor for a diagram type, starting from `loaded` or from a fresh starter. */
  private mountKind(kind: Kind, loaded?: Loaded & { ok: true }): void {
    this.kindEditor?.destroy();
    this.kindEditor = null;
    this.kind = kind;
    const from = loaded?.kind === kind ? loaded : undefined;
    if (kind === 'sequence') this.kindEditor = new SequenceEditor(this.kindApi(), from?.kind === 'sequence' ? from.diagram : starterSequence(), !from);
    else if (kind === 'gantt') this.kindEditor = new GanttEditor(this.kindApi(), from?.kind === 'gantt' ? from.diagram : starterGantt(), !from);
    else if (kind === 'journey') this.kindEditor = new JourneyEditor(this.kindApi(), from?.kind === 'journey' ? from.journey : starterJourney(), !from);
    else if (kind === 'pie') this.kindEditor = new PieEditor(this.kindApi(), from?.kind === 'pie' ? from.pie : starterPie(), !from);
    else if (kind === 'requirement') this.kindEditor = new RequirementEditor(this.kindApi(), from?.kind === 'requirement' ? from.requirement : starterRequirements(), !from);
    else if (kind === 'git') this.kindEditor = new GitEditor(this.kindApi(), from?.kind === 'git' ? from.git : starterGit(), !from);
    else if (kind === 'block') this.kindEditor = new BlockEditor(this.kindApi(), from?.kind === 'block' ? from.block : starterBlocks(), !from);
    else if (kind === 'architecture') this.kindEditor = new ArchitectureEditor(this.kindApi(), from?.kind === 'architecture' ? from.architecture : starterArchitecture(), !from);
    else if (kind === 'class') this.kindEditor = new ClassEditor(this.kindApi(), from?.kind === 'class' ? from.classes : starterClasses(), !from);
    else if (kind === 'er') this.kindEditor = new ErEditor(this.kindApi(), from?.kind === 'er' ? from.er : starterEr(), !from);
    else if (kind === 'state') this.kindEditor = new StateEditor(this.kindApi(), from?.kind === 'state' ? from.state : starterState(), !from);
    else if (kind === 'packet') this.kindEditor = new PacketEditor(this.kindApi(), from?.kind === 'packet' ? from.packet : starterPacket(), !from);
    else if (kind === 'treemap') this.kindEditor = new TreemapEditor(this.kindApi(), from?.kind === 'treemap' ? from.treemap : starterTreemap(), !from);
    else if (kind === 'sankey') this.kindEditor = new SankeyEditor(this.kindApi(), from?.kind === 'sankey' ? from.sankey : starterSankey(), !from);
    else if (kind === 'kanban') this.kindEditor = new KanbanEditor(this.kindApi(), from?.kind === 'kanban' ? from.kanban : starterKanban(), !from);
    else if (kind === 'xychart') this.kindEditor = new XyChartEditor(this.kindApi(), from?.kind === 'xychart' ? from.chart : starterXyChart(), !from);
    else if (kind === 'timeline') this.kindEditor = new TimelineEditor(this.kindApi(), from?.kind === 'timeline' ? from.timeline : starterTimeline(), !from);
    else if (kind === 'quadrant') this.kindEditor = new QuadrantEditor(this.kindApi(), from?.kind === 'quadrant' ? from.quadrant : starterQuadrant(), !from);
    else if (kind === 'radar') this.kindEditor = new RadarEditor(this.kindApi(), from?.kind === 'radar' ? from.radar : starterRadar(), !from);
    else if (kind === 'mindmap') this.kindEditor = new MindMapEditor(this.kindApi(), from?.kind === 'mindmap' ? from.map : starterMindMap(), !from);
    this.kindHost.replaceChildren(...(this.kindEditor ? [this.kindEditor.el] : []));
    this.root.classList.toggle('is-flowchart', kind === 'flowchart');
    if (from && from.kind !== 'flowchart') {
      this.titleField.value = from.title;
      this.descriptionField.value = from.description;
      this.titleAlignSelect.value = from.titleAlign;
    }
  }

  /** The diagram type can be chosen only until something has been drawn. */
  private canChangeKind(): boolean {
    if (!this.isNew || this.mode !== 'visual') return false;
    return this.kind === 'flowchart' ? this.diagram.nodes.length === 0 : !!this.kindEditor?.isPristine();
  }

  private changeKind(kind: Kind): void {
    if (kind === this.kind) return;
    if (!this.canChangeKind()) {
      this.kindSelect.value = this.kind;
      this.announce('This diagram already has content. Cancel and start a new diagram to change its type.');
      return;
    }
    if (kind === 'flowchart') {
      this.mountKind('flowchart');
      this.diagram = { ...emptyDiagram(), title: this.titleField.value, description: this.descriptionField.value, titleAlign: this.titleAlignSelect.value as TitleAlign };
    } else this.mountKind(kind);
    this.selection = null;
    this.renderAll();
    this.announce(`${KINDS.find((k) => k.id === kind)?.name}. ${kind === 'flowchart' ? 'Add shapes from the list.' : 'A starter is ready to edit.'}`);
  }

  isDirty(): boolean {
    return this.getSource() !== this.initialSource;
  }

  /** Cancel an in-progress label edit or connection. True if there was one. */
  cancelTransient(): boolean {
    if (this.kindEditor?.cancelTransient?.()) return true;
    if (this.inlineEdit) {
      this.finishInlineEdit(false);
      return true;
    }
    if (this.connectArmed || this.connectFrom) {
      this.stopConnecting('Connecting cancelled.');
      return true;
    }
    return false;
  }

  focus(): void {
    if (!this.titleField.value.trim()) this.titleField.focus();
    else if (this.mode === 'code') {
      this.codeField.focus();
      // Start at the top of the source, not wherever the cursor was left.
      this.codeField.setSelectionRange(0, 0);
      this.codeField.scrollTop = 0;
    }
    else if (this.kindEditor) this.kindEditor.focus();
    else if (this.diagram.nodes.length) this.focusNode(this.diagram.nodes[0].id);
    else this.firstPaletteButton.focus();
  }

  destroy(): void {
    window.clearTimeout(this.previewTimer);
    this.resizeObserver?.disconnect();
    this.mounted?.destroy();
    this.root.remove();
  }

  // ───────────────────────────── Construction ─────────────────────────────

  private build(container: HTMLElement): void {
    this.root = h('div', { class: 'volcanic-editor is-flowchart', on: { keydown: (e) => this.onRootKeydown(e) } });
    this.root.append(this.buildMeta(), this.buildToolbar(), this.buildBody(), this.buildFooter());
    container.append(this.root);

    this.resizeObserver = new ResizeObserver(() => {
      if (this.mode === 'visual') this.drawEdges();
    });
    this.resizeObserver.observe(this.wrap);
  }

  private iconButton(label: string, icon: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
    const iconEl = h('span', { class: 'volcanic-icon', attrs: { 'aria-hidden': 'true' } });
    this.host.setIcon(iconEl, icon);
    return h(
      'button',
      {
        class: `volcanic-button ${extraClass}`.trim(),
        attrs: { type: 'button' },
        on: {
          click: (event) => {
            if ((event.currentTarget as HTMLElement).getAttribute('aria-disabled') === 'true') return;
            onClick();
          },
        },
      },
      iconEl,
      h('span', { text: label }),
    );
  }

  /** Title and description: what the diagram is, for everyone including screen-reader users. Both are optional; a note says what a missing title costs. */
  private buildMeta(): HTMLElement {
    const titleId = `${this.uid}-title`;
    const errorId = `${titleId}-error`;
    const descriptionId = `${this.uid}-description`;
    this.titleField = h('input', {
      class: 'volcanic-input',
      attrs: { id: titleId, type: 'text', 'aria-describedby': errorId, autocomplete: 'off', maxlength: '150' },
      on: { input: () => this.onTitleInput() },
    });
    this.titleError = h('p', { class: 'volcanic-hint volcanic-title-note', attrs: { id: errorId, hidden: true } });
    this.descriptionField = h('input', {
      class: 'volcanic-input',
      attrs: { id: descriptionId, type: 'text', autocomplete: 'off', maxlength: '300', 'aria-describedby': `${descriptionId}-hint` },
      on: {
        input: () => {
          if (this.kind !== 'flowchart') {
            this.renderOutput();
            return;
          }
          this.diagram.description = this.descriptionField.value;
          this.commit('description');
          this.renderOutput();
          this.renderToolbarState();
        },
      },
    });
    const title = h('div', { class: 'volcanic-field volcanic-meta-title' }, h('label', { attrs: { for: titleId }, text: 'Title (recommended)' }), this.titleField, this.titleError);
    const description = h(
      'div',
      { class: 'volcanic-field volcanic-meta-description volcanic-visual-only' },
      h('label', { text: 'Description (optional)', attrs: { for: descriptionId } }),
      this.descriptionField,
      h('p', { class: 'volcanic-sr-only', attrs: { id: `${descriptionId}-hint` }, text: 'A sentence for screen-reader users saying what the diagram shows.' }),
    );
    const alignId = `${this.uid}-title-align`;
    this.titleAlignSelect = this.selectControl<TitleAlign>(TITLE_ALIGNS, 'center', (value) => {
      if (this.mode === 'visual' && this.kind !== 'flowchart') {
        this.renderOutput();
      } else if (this.mode === 'visual') {
        this.diagram.titleAlign = value;
        this.commit();
        this.renderOutput();
        this.renderToolbarState();
      } else {
        this.codeText = setTitleAlign(this.codeText, value);
        this.codeField.value = this.codeText;
        this.schedulePreview();
      }
      this.announce(`Title position: ${TITLE_ALIGNS.find((a) => a.id === value)?.name}.`);
    });
    this.titleAlignSelect.id = alignId;
    const align = h('div', { class: 'volcanic-field volcanic-meta-align' }, h('label', { text: 'Title position', attrs: { for: alignId } }), this.titleAlignSelect);
    const sizeId = `${this.uid}-text-size`;
    this.fontSelect = this.selectControl<string>(TEXT_SIZES, String(this.fontSize || ''), (value) => {
      this.fontSize = Number(value) || 0;
      if (this.mode === 'code') {
        this.codeText = setFontSize(this.codeText, this.fontSize);
        this.codeField.value = this.codeText;
      } else if (this.mode === 'visual' && this.kind === 'flowchart') this.commit();
      this.renderOutput();
      this.renderToolbarState();
      this.announce(`Text size: ${TEXT_SIZES.find((s) => s.id === value)?.name}.`);
    });
    this.fontSelect.id = sizeId;
    const size = h('div', { class: 'volcanic-field volcanic-meta-size' }, h('label', { text: 'Text size', attrs: { for: sizeId } }), this.fontSelect);
    return h('div', { class: 'volcanic-meta' }, title, align, description, this.buildThemePicker(), size);
  }

  /** Colour theme: a drop-down whose options show their colours. */
  private buildThemePicker(): HTMLElement {
    const id = `${this.uid}-theme`;
    const labelId = `${id}-label`;
    this.themePicker = swatchSelect(id, labelId, this.themeOptions(), this.theme, (value) => this.chooseTheme(value));
    this.themeHint = h('p', { class: 'volcanic-sr-only', attrs: { id: `${id}-hint` } });
    this.themePicker.el.querySelector('button')?.setAttribute('aria-describedby', `${id}-hint`);
    this.syncThemeButtons();
    return h('div', { class: 'volcanic-field volcanic-meta-theme' }, h('span', { class: 'volcanic-theme-label', text: 'Colour theme', attrs: { id: labelId } }), this.themePicker.el, this.themeHint);
  }

  private themeOptions(): SwatchOption[] {
    const dark = document.body.classList.contains('theme-dark');
    const fallback = themeById(this.host.defaultTheme ?? '');
    return [
      { id: DEFAULT_THEME_ID, name: 'Default', description: fallback?.light ? `Your setting: ${fallback.name}` : 'Your setting: match Obsidian', colours: swatchColours(fallback, dark) },
      ...THEMES.map((theme) => ({ id: theme.id, name: theme.name, description: theme.description, colours: swatchColours(theme, dark) })),
    ];
  }

  /** The theme in force: the diagram's own, or the default from settings. */
  private effectiveTheme(): string {
    return this.theme || this.host.defaultTheme || '';
  }

  private syncThemeButtons(): void {
    this.themePicker?.set(this.theme, this.themeOptions());
    const effective = this.effectiveTheme();
    const colours = themeById(effective)?.light;
    // Paint the editors with the theme too, so what you arrange looks like what you will get.
    for (const el of [this.previewPanel, this.root]) {
      if (!el) continue;
      if (colours) {
        el.setAttribute('data-volcanic-theme', effective);
        el.removeAttribute(NO_THEME_ATTR);
      } else {
        el.removeAttribute('data-volcanic-theme');
        el.setAttribute(NO_THEME_ATTR, '');
      }
    }
    if (this.themeHint) {
      const theme = themeById(this.theme);
      this.themeHint.textContent = this.theme === DEFAULT_THEME_ID ? 'Uses the colour theme chosen in Volcanic’s settings.' : theme?.description ?? '';
    }
  }

  /** Change the theme because the source text says so (no extra edits to the text). */
  private setFontQuietly(size: number): void {
    if (size === this.fontSize) return;
    this.fontSize = size;
    this.fontSelect.value = String(size || '');
  }

  private setThemeQuietly(theme: string): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.syncThemeButtons();
  }

  private chooseTheme(id: string): void {
    if (id === this.theme) return;
    this.theme = id;
    this.syncThemeButtons();
    if (this.mode === 'code') {
      this.codeText = setTheme(this.codeText, id);
      this.codeField.value = this.codeText;
    } else if (this.mode === 'visual' && this.kind === 'flowchart') {
      this.commit();
    }
    this.renderOutput();
    this.renderToolbarState();
    const theme = themeById(id);
    this.announce(`Colour theme: ${id === DEFAULT_THEME_ID ? 'Default' : theme?.name ?? id}.`);
  }

  private onTitleInput(): void {
    if (this.mode === 'visual' && this.kind !== 'flowchart') {
      this.renderOutput();
    } else if (this.mode === 'visual') {
      this.diagram.title = this.titleField.value;
      this.commit('title');
      this.renderOutput();
      this.renderToolbarState();
    } else {
      this.codeText = setTitle(this.codeText, this.titleField.value);
      this.codeField.value = this.codeText;
      this.schedulePreview();
    }
  }

  /** A gentle reminder, never a block: without a title the diagram has no name for screen readers. */
  private updateTitleNote(): void {
    const missing = !this.titleField.value.trim();
    this.titleError.textContent = missing ? "Without a title, screen-reader users won't hear a name for this diagram. A description is read out too, if you add one." : '';
    this.titleError.hidden = !missing;
  }

  private buildToolbar(): HTMLElement {
    const modes = h('div', { class: 'volcanic-segmented', attrs: { role: 'group', 'aria-label': 'Editing mode' } });
    for (const [mode, name] of [['visual', 'Visual'], ['code', 'Code']] as [Mode, string][]) {
      const button = h('button', { class: 'volcanic-segment', text: name, attrs: { type: 'button', 'aria-pressed': 'false' }, on: { click: () => this.setMode(mode) } });
      this.modeButtons.set(mode, button);
      modes.append(button);
    }

    const directionId = `${this.uid}-direction`;
    this.directionSelect = h('select', {
      class: 'dropdown volcanic-select',
      attrs: { id: directionId },
      on: {
        change: () => {
          this.diagram.direction = this.directionSelect.value as Direction;
          this.changed();
          this.announce(`Flow direction: ${DIRECTIONS.find((d) => d.id === this.diagram.direction)?.name}.`);
        },
      },
    });
    for (const direction of DIRECTIONS) this.directionSelect.append(h('option', { text: direction.name, attrs: { value: direction.id } }));
    const direction = h('div', { class: 'volcanic-field-inline volcanic-visual-only volcanic-flow-only' }, h('label', { text: 'Flow', attrs: { for: directionId } }), this.directionSelect);

    const kindId = `${this.uid}-kind`;
    this.kindSelect = this.selectControl<Kind>(KINDS, 'flowchart', (value) => this.changeKind(value));
    this.kindSelect.id = kindId;
    this.kindField = h('div', { class: 'volcanic-field-inline volcanic-visual-only' }, h('label', { text: 'Diagram type', attrs: { for: kindId } }), this.kindSelect);

    this.undoButton = this.iconButton('Undo', 'undo-2', () => this.undo());
    this.redoButton = this.iconButton('Redo', 'redo-2', () => this.redo());
    this.connectButton = this.iconButton('Connect', 'link', () => this.toggleConnect());
    this.connectButton.setAttribute('aria-pressed', 'false');
    const tidy = this.iconButton('Tidy up', 'layout-dashboard', () => this.tidy());
    this.connectButton.classList.add('volcanic-flow-only');
    tidy.classList.add('volcanic-flow-only');
    const actions = h('div', { class: 'volcanic-toolbar-group volcanic-visual-only' }, this.undoButton, this.redoButton, this.connectButton, tidy);

    return h('div', { class: 'volcanic-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Diagram tools' } }, modes, this.kindField, direction, actions);
  }

  private buildBody(): HTMLElement {
    // Palette
    const palette = h('div', { class: 'volcanic-palette volcanic-visual-only volcanic-flow-only', attrs: { role: 'group', 'aria-label': 'Add a shape' } });
    palette.append(h('div', { class: 'volcanic-section-title', text: 'Shapes', attrs: { 'aria-hidden': 'true' } }));
    SHAPES.forEach((shape, index) => {
      const button = h(
        'button',
        {
          class: 'volcanic-palette-item',
          attrs: { type: 'button', 'aria-label': `Add ${shape.name.toLowerCase()} shape. ${shape.hint}.`, title: `${shape.name} — ${shape.hint}. Click to add, or drag onto the canvas.` },
          on: {
            click: () => {
              if (this.suppressClick) {
                this.suppressClick = false;
                return;
              }
              this.addNode(shape.id);
            },
            pointerdown: (event) => this.startPaletteDrag(event, shape.id),
          },
        },
        shapeIcon(shape.id),
        h('span', { text: shape.name }),
      );
      if (index === 0) this.firstPaletteButton = button;
      palette.append(button);
    });

    // Canvas
    const helpId = `${this.uid}-canvas-help`;
    this.canvas = h('div', { class: 'volcanic-canvas' });
    const defs = s(
      'defs',
      {},
      this.marker('arrow', false),
      this.marker('arrow-selected', true),
    );
    this.edgeGroup = s('g');
    this.dragLine = s('path', { class: 'volcanic-drag-line', 'marker-end': `url(#${this.uid}-arrow-selected)` });
    this.dragLine.style.display = 'none';
    this.guideGroup = s('g', { 'aria-hidden': 'true' });
    this.edgeLayer = s('svg', { class: 'volcanic-edges' }, defs, this.edgeGroup, this.guideGroup, this.dragLine);
    this.emptyState = h(
      'div',
      { class: 'volcanic-empty' },
      h('div', { class: 'volcanic-empty-title', text: 'Start your diagram' }),
      h('p', { text: 'Pick a shape from the list, drag one onto the canvas, or double-click anywhere here.' }),
      h('button', { class: 'mod-cta volcanic-button', text: 'Add first shape', attrs: { type: 'button' }, on: { click: () => this.addNode('stadium') } }),
    );
    this.connectBanner = h('div', { class: 'volcanic-banner', attrs: { hidden: true } });
    this.wrap = h(
      'div',
      {
        class: 'volcanic-canvas-wrap',
        attrs: { role: 'application', 'aria-label': 'Diagram canvas', 'aria-describedby': helpId },
        on: {
          pointerdown: (event) => {
            if (event.target === this.wrap || event.target === this.canvas || event.target === this.edgeLayer) this.select(null);
          },
          dblclick: (event) => {
            if (event.target !== this.wrap && event.target !== this.canvas) return;
            const point = this.canvasPoint(event);
            this.addNode('rect', { x: point.x - 70, y: point.y - 24 });
          },
        },
      },
      this.canvas,
    );
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Tab moves between shapes and connections. Arrow keys move the focused shape. Enter renames it. C starts a connection, then move to another shape and press Enter. Delete removes it. Every action is also available in the Properties and Outline panels.',
    });
    const canvasArea = h('div', { class: 'volcanic-canvas-area volcanic-visual-only volcanic-flow-only' }, this.wrap, this.emptyState, this.connectBanner, help);

    // Code editor (shown in code mode)
    const codeId = `${this.uid}-code`;
    const templateId = `${this.uid}-template`;
    this.codeNotice = h('p', { class: 'volcanic-notice', attrs: { hidden: true } });
    this.codeField = h('textarea', {
      class: 'volcanic-code-field',
      attrs: { id: codeId, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-describedby': `${codeId}-hint` },
      on: {
        input: () => {
          this.codeText = this.codeField.value;
          const title = readTitle(this.codeText);
          if (title || !this.codeText.trim()) this.titleField.value = title;
          this.titleAlignSelect.value = readTitleAlign(this.codeText);
          this.setThemeQuietly(readTheme(this.codeText));
        this.setFontQuietly(readFontSize(this.codeText));
          this.setFontQuietly(readFontSize(this.codeText));
          this.schedulePreview();
        },
      },
    });
    const templateSelect = h('select', {
      class: 'dropdown volcanic-select',
      attrs: { id: templateId },
      on: {
        change: () => {
          const template = TEMPLATES.find((t) => t.id === templateSelect.value);
          templateSelect.value = '';
          if (!template) return;
          // Carry over a title that was already typed.
          this.codeText = setFontSize(setTheme(setTitleAlign(setTitle(template.source, this.titleField.value), this.titleAlignSelect.value as TitleAlign), this.theme), this.fontSize);
          this.codeField.value = this.codeText;
          this.schedulePreview();
          this.announce(`${template.name} template inserted.`);
          this.codeField.focus();
        },
      },
    });
    templateSelect.append(h('option', { text: 'Choose a template…', attrs: { value: '' } }));
    for (const template of [...TEMPLATES].sort((a, b) => a.name.localeCompare(b.name))) templateSelect.append(h('option', { text: template.name, attrs: { value: template.id } }));
    const codeArea = h(
      'div',
      { class: 'volcanic-code-area volcanic-code-only' },
      h(
        'div',
        { class: 'volcanic-code-head' },
        h('label', { class: 'volcanic-section-title', text: 'Mermaid source', attrs: { for: codeId } }),
        h('div', { class: 'volcanic-field-inline' }, h('label', { text: 'Start from', attrs: { for: templateId } }), templateSelect),
      ),
      this.codeNotice,
      this.codeField,
      h('p', { class: 'volcanic-hint', attrs: { id: `${codeId}-hint` }, text: 'The preview updates as you type. Flowcharts can be switched back to Visual mode.' }),
    );

    // Preview + generated code
    this.previewHost = h('div', { class: 'volcanic-preview-host' });
    this.previewMessage = h('div', { class: 'volcanic-preview-message', attrs: { role: 'status' } });
    const previewPanel = h('div', { class: 'volcanic-panel volcanic-preview' }, this.previewHost, this.previewMessage);
    this.previewPanel = previewPanel;
    this.syncThemeButtons();
    this.codeView = h('pre', { class: 'volcanic-code-view', attrs: { tabindex: '0', 'aria-label': 'Generated Mermaid source' } });
    const copy = this.iconButton('Copy', 'copy', () => {
      void navigator.clipboard?.writeText(this.getSource()).then(
        () => this.announce('Mermaid source copied.'),
        () => this.announce('Copying failed.'),
      );
    });
    const codePanel = h('div', { class: 'volcanic-panel volcanic-code-panel' }, this.codeView, h('p', { class: 'volcanic-hint', text: 'The last line remembers where shapes sit on the canvas. Pele chooses the final layout.' }), copy);
    this.outputTabs = createTabs('Result', [
      { id: 'preview', name: 'Preview', panel: previewPanel },
      { id: 'source', name: 'Mermaid', panel: codePanel },
    ]);
    const output = h('section', { class: 'volcanic-card volcanic-output', attrs: { 'aria-label': 'Result rendered by Pele' } }, this.outputTabs.list, previewPanel, codePanel);

    // Properties + outline
    this.inspector = h('div', { class: 'volcanic-panel volcanic-inspector' });
    this.outline = h('div', { class: 'volcanic-panel volcanic-outline' });
    this.sideTabs = createTabs('Details', [
      { id: 'properties', name: 'Properties', panel: this.inspector },
      { id: 'outline', name: 'Outline', panel: this.outline },
    ]);
    const details = h('section', { class: 'volcanic-card volcanic-details volcanic-visual-only volcanic-flow-only', attrs: { 'aria-label': 'Details' } }, this.sideTabs.list, this.inspector, this.outline);

    const side = h('div', { class: 'volcanic-side' }, output, details);
    this.kindHost = h('div', { class: 'volcanic-kind-host volcanic-kind-only' });
    return h('div', { class: 'volcanic-body' }, palette, canvasArea, codeArea, this.kindHost, side);
  }

  private buildFooter(): HTMLElement {
    this.status = h('div', { class: 'volcanic-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    const cancel = h('button', { class: 'volcanic-button', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => this.host.onCancel() } });
    const submit = h('button', { class: 'mod-cta volcanic-button', text: this.host.submitLabel, attrs: { type: 'button' }, on: { click: () => this.submit() } });
    return h('div', { class: 'volcanic-footer' }, this.status, h('div', { class: 'volcanic-footer-actions' }, cancel, submit));
  }

  private marker(name: string, selected: boolean): SVGMarkerElement {
    return s(
      'marker',
      { id: `${this.uid}-${name}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' },
      s('path', { d: 'M0,0 L10,5 L0,10 z', class: selected ? 'volcanic-arrowhead is-selected' : 'volcanic-arrowhead' }),
    );
  }

  // ───────────────────────────── State changes ─────────────────────────────

  private commit(tag = ''): void {
    const snapshot = JSON.stringify(this.diagram);
    if (snapshot === this.history[this.historyIndex]) return;
    const now = Date.now();
    const merge = tag !== '' && tag === this.lastTag && now - this.lastCommit < 1200 && this.historyIndex > 0;
    this.history.length = this.historyIndex + 1;
    if (merge) this.history[this.historyIndex] = snapshot;
    else this.history.push(snapshot);
    this.historyIndex = this.history.length - 1;
    this.lastTag = tag;
    this.lastCommit = now;
  }

  /** Call after any change to the diagram. */
  private changed(options: { tag?: string; inspector?: boolean } = {}): void {
    this.commit(options.tag);
    this.renderCanvas();
    this.renderOutline();
    this.renderOutput();
    this.renderToolbarState();
    if (options.inspector !== false) this.renderInspector();
  }

  private renderAll(): void {
    this.renderCanvas();
    this.renderOutline();
    this.renderOutput();
    this.renderToolbarState();
    this.renderInspector();
  }

  private undo(): void {
    if (this.kind !== 'flowchart') {
      this.kindEditor?.undo();
      return;
    }
    if (this.historyIndex <= 0) return;
    this.historyIndex -= 1;
    this.restore('Undone.');
  }

  private redo(): void {
    if (this.kind !== 'flowchart') {
      this.kindEditor?.redo();
      return;
    }
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex += 1;
    this.restore('Redone.');
  }

  private restore(message: string): void {
    this.diagram = JSON.parse(this.history[this.historyIndex]) as Diagram;
    this.lastTag = '';
    if (this.selection && !this.findSelected()) this.selection = null;
    this.renderAll();
    this.announce(message);
  }

  private findSelected(): DiagramNode | DiagramEdge | undefined {
    if (!this.selection) return undefined;
    return this.selection.kind === 'node' ? this.node(this.selection.id) : this.edge(this.selection.id);
  }

  private node(id: string): DiagramNode | undefined {
    return this.diagram.nodes.find((n) => n.id === id);
  }

  private edge(id: string): DiagramEdge | undefined {
    return this.diagram.edges.find((e) => e.id === id);
  }

  private nodeLabel(id: string): string {
    const node = this.node(id);
    return node ? plainLabel(node.label) : id;
  }

  private announce(message: string): void {
    this.status.textContent = message;
  }

  private select(selection: Selection): void {
    const same = selection?.kind === this.selection?.kind && selection?.id === this.selection?.id;
    if (same) return;
    this.selection = selection;
    this.updateSelectionClasses();
    this.renderInspector();
  }

  // ───────────────────────────── Mode ─────────────────────────────

  private setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.cancelTransient();
    if (mode === 'code') {
      this.codeText = this.getSource();
      this.pendingTitle = this.titleField.value;
      this.codeReason = '';
      this.mode = 'code';
    } else {
      const text = this.codeText.trim();
      if (text) {
        const result = this.load(text);
        if (!result.ok) {
          this.codeReason = result.reason;
          this.applyMode();
          this.announce(`Cannot switch to Visual mode. ${result.reason}`);
          return;
        }
        if (result.kind === 'flowchart') {
          this.mountKind('flowchart');
          this.diagram = result.diagram;
        } else this.mountKind(result.kind, result);
      } else {
        this.mountKind('flowchart');
        this.diagram = { ...emptyDiagram(), title: this.titleField.value, titleAlign: this.titleAlignSelect.value as TitleAlign };
      }
      this.selection = null;
      this.mode = 'visual';
      this.commit();
    }
    this.applyMode();
    this.renderAll();
    this.announce(mode === 'code' ? 'Code mode. Edit the Mermaid source directly.' : 'Visual mode.');
  }

  private applyMode(): void {
    this.root.classList.toggle('is-code', this.mode === 'code');
    for (const [mode, button] of this.modeButtons) button.setAttribute('aria-pressed', String(mode === this.mode));
    if (this.mode === 'code') {
      // The source is already on screen, so the result panel only shows the preview.
      this.outputTabs.select('preview');
      this.codeField.value = this.codeText;
      this.titleField.value = readTitle(this.codeText) || this.pendingTitle;
      this.pendingTitle = '';
      if (this.codeText.trim()) {
        this.titleAlignSelect.value = readTitleAlign(this.codeText);
        this.setThemeQuietly(readTheme(this.codeText));
      }
      this.codeNotice.hidden = !this.codeReason;
      this.codeNotice.textContent = this.codeReason ? `This diagram is edited as text. ${this.codeReason}` : '';
      this.schedulePreview();
    }
  }

  // ───────────────────────────── Node & edge actions ─────────────────────────────

  private addNode(shape: Shape, at?: { x: number; y: number }, edit = true): DiagramNode {
    const id = nextId('n', this.diagram.nodes.map((n) => n.id));
    const position = at ? { x: snap(at.x), y: snap(at.y) } : this.freeSpot();
    const node: DiagramNode = { id, label: DEFAULT_LABELS[shape] ?? 'Step', shape, ...position };
    this.diagram.nodes.push(node);
    this.selection = { kind: 'node', id };
    this.changed();
    this.announce(`${shapeName(shape)} added. Type a name and press Enter.`);
    this.focusNode(id);
    if (edit) this.startInlineEdit(id);
    return node;
  }

  /** A place for a new node: after the selected one, or in view, avoiding overlaps. */
  private freeSpot(): { x: number; y: number } {
    const horizontal = this.diagram.direction === 'LR' || this.diagram.direction === 'RL';
    const anchor = this.selection?.kind === 'node' ? this.node(this.selection.id) : this.diagram.nodes[this.diagram.nodes.length - 1];
    let x = snap(this.wrap.scrollLeft + Math.max(60, this.wrap.clientWidth / 2 - 70));
    let y = snap(this.wrap.scrollTop + 60);
    if (anchor) {
      x = anchor.x + (horizontal ? 230 : 0);
      y = anchor.y + (horizontal ? 0 : 130);
    }
    const collides = (): boolean => this.diagram.nodes.some((n) => Math.abs(n.x - x) < 170 && Math.abs(n.y - y) < 80);
    let guard = 0;
    while (collides() && guard++ < 200) {
      if (horizontal) y += 100;
      else x += 200;
    }
    return { x: snap(x), y: snap(y) };
  }

  private deleteSelected(): void {
    const selection = this.selection;
    if (!selection) return;
    if (selection.kind === 'node') {
      const index = this.diagram.nodes.findIndex((n) => n.id === selection.id);
      if (index < 0) return;
      const name = this.nodeLabel(selection.id);
      this.diagram.nodes.splice(index, 1);
      this.diagram.edges = this.diagram.edges.filter((e) => e.from !== selection.id && e.to !== selection.id);
      const next = this.diagram.nodes[Math.min(index, this.diagram.nodes.length - 1)];
      this.selection = next ? { kind: 'node', id: next.id } : null;
      this.changed();
      this.announce(`${name} deleted.`);
      if (next) this.focusNode(next.id);
      else this.firstPaletteButton.focus();
    } else {
      const edge = this.edge(selection.id);
      if (!edge) return;
      this.diagram.edges = this.diagram.edges.filter((e) => e.id !== selection.id);
      this.selection = { kind: 'node', id: edge.from };
      this.changed();
      this.announce('Connection deleted.');
      this.focusNode(edge.from);
    }
  }

  private duplicateSelected(): void {
    if (this.selection?.kind !== 'node') return;
    const source = this.node(this.selection.id);
    if (!source) return;
    const id = nextId('n', this.diagram.nodes.map((n) => n.id));
    this.diagram.nodes.push({ ...source, id, x: source.x + 30, y: source.y + 30 });
    this.selection = { kind: 'node', id };
    this.changed();
    this.announce(`${plainLabel(source.label)} duplicated.`);
    this.focusNode(id);
  }

  private addEdge(from: string, to: string): DiagramEdge | null {
    if (!this.node(from) || !this.node(to)) return null;
    const existing = this.diagram.edges.find((e) => e.from === from && e.to === to);
    if (existing) {
      this.announce('Those shapes are already connected.');
      this.select({ kind: 'edge', id: existing.id });
      return existing;
    }
    const edge: DiagramEdge = { id: nextId('e', this.diagram.edges.map((e) => e.id)), from, to, label: '', line: 'solid', arrow: 'arrow' };
    this.diagram.edges.push(edge);
    this.changed({ inspector: false });
    this.announce(`Connected ${this.nodeLabel(from)} to ${this.nodeLabel(to)}.`);
    return edge;
  }

  private moveNode(id: string, dx: number, dy: number): void {
    const node = this.node(id);
    if (!node) return;
    node.x = Math.max(0, node.x + dx);
    node.y = Math.max(0, node.y + dy);
    this.commit(`move:${id}`);
    this.placeNode(node);
    this.drawEdges();
    this.renderOutput();
    this.renderToolbarState();
    this.syncPositionFields(node);
    this.nodeEls.get(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.announce(`Moved to ${node.x}, ${node.y}.`);
  }

  private tidy(): void {
    if (!this.diagram.nodes.length) return;
    // Use the shapes' drawn sizes, so shapes of different heights line up by their middles.
    autoLayout(this.diagram, (node) => {
      const el = this.nodeEls.get(node.id);
      return el && el.offsetWidth ? { w: el.offsetWidth, h: el.offsetHeight } : null;
    });
    this.changed();
    this.wrap.scrollTo({ left: 0, top: 0 });
    this.announce('Shapes arranged to follow the flow.');
  }

  // ───────────────────────────── Connecting ─────────────────────────────

  private toggleConnect(): void {
    if (this.connectArmed || this.connectFrom) {
      this.stopConnecting('Connecting cancelled.');
      return;
    }
    if (this.diagram.nodes.length < 1) {
      this.announce('Add a shape before connecting.');
      return;
    }
    this.connectArmed = true;
    if (this.selection?.kind === 'node') this.beginConnection(this.selection.id);
    else this.updateConnectUi('Choose the shape the connection starts from.');
  }

  private beginConnection(from: string): void {
    this.connectArmed = true;
    this.connectFrom = from;
    this.updateConnectUi(`Connecting from ${this.nodeLabel(from)}. Choose the shape to connect to, or press Escape to cancel.`);
  }

  private completeConnection(to: string): void {
    const from = this.connectFrom;
    if (!from) return;
    this.connectArmed = false;
    this.connectFrom = null;
    this.updateConnectUi('');
    const edge = this.addEdge(from, to);
    if (edge) {
      this.selection = { kind: 'edge', id: edge.id };
      this.updateSelectionClasses();
      this.renderInspector();
    }
  }

  private stopConnecting(message: string): void {
    this.connectArmed = false;
    this.connectFrom = null;
    this.updateConnectUi('');
    this.announce(message);
  }

  private updateConnectUi(message: string): void {
    const active = this.connectArmed || !!this.connectFrom;
    this.connectButton.setAttribute('aria-pressed', String(active));
    this.root.classList.toggle('is-connecting', active);
    this.connectBanner.hidden = !message;
    this.connectBanner.textContent = message;
    if (message) this.announce(message);
    for (const [id, el] of this.nodeEls) el.classList.toggle('is-connect-source', id === this.connectFrom);
  }

  // ───────────────────────────── Canvas rendering ─────────────────────────────

  private renderCanvas(): void {
    const active = document.activeElement;
    const focusedNode = active instanceof HTMLElement && this.canvas.contains(active) ? active.closest<HTMLElement>('[data-node]')?.dataset.node : undefined;
    const focusedEdge = active instanceof SVGElement && this.edgeLayer.contains(active) ? active.closest<SVGElement>('[data-edge]')?.dataset.edge : undefined;

    this.inlineEdit = null;
    this.nodeEls.clear();
    this.canvas.replaceChildren();
    for (const node of this.diagram.nodes) {
      const el = this.buildNode(node);
      this.nodeEls.set(node.id, el);
      this.canvas.append(el);
    }
    this.canvas.append(this.edgeLayer);
    this.emptyState.hidden = this.diagram.nodes.length > 0;
    this.drawEdges();
    this.updateSelectionClasses();

    if (focusedNode && this.nodeEls.has(focusedNode)) this.nodeEls.get(focusedNode)!.focus({ preventScroll: true });
    else if (focusedEdge) this.edgeGroup.querySelector<SVGElement>(`[data-edge="${focusedEdge}"]`)?.focus({ preventScroll: true });
  }

  private describeNode(node: DiagramNode): string {
    const outgoing = this.diagram.edges.filter((e) => e.from === node.id).map((e) => this.nodeLabel(e.to));
    const links = outgoing.length ? ` Connects to ${outgoing.join(', ')}.` : ' No outgoing connections.';
    return `${plainLabel(node.label)}, ${shapeName(node.shape).toLowerCase()} shape.${links}`;
  }

  private buildNode(node: DiagramNode): HTMLElement {
    const handle = h('span', {
      class: 'volcanic-node-handle',
      attrs: { 'aria-hidden': 'true', title: 'Drag to another shape to connect' },
      on: { pointerdown: (event) => this.startHandleDrag(event, node.id) },
    });
    const el = h(
      'div',
      {
        class: 'volcanic-node',
        attrs: { role: 'button', tabindex: '0', 'data-node': node.id, 'data-shape': node.shape, 'aria-label': this.describeNode(node), 'aria-pressed': 'false' },
        on: {
          pointerdown: (event) => this.startNodeDrag(event, node.id),
          focus: () => this.select({ kind: 'node', id: node.id }),
          dblclick: (event) => {
            event.stopPropagation();
            this.startInlineEdit(node.id);
          },
          keydown: (event) => this.onNodeKeydown(event, node.id),
        },
      },
      nodeOutline(node.shape),
      h('span', { class: 'volcanic-node-label', text: node.label.trim() ? node.label : ' ' }),
      handle,
    );
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    return el;
  }

  private placeNode(node: DiagramNode): void {
    const el = this.nodeEls.get(node.id);
    if (!el) return;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
  }

  private updateSelectionClasses(): void {
    for (const [id, el] of this.nodeEls) {
      const on = this.selection?.kind === 'node' && this.selection.id === id;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-pressed', String(on));
      el.classList.toggle('is-connect-source', id === this.connectFrom);
    }
    for (const group of Array.from(this.edgeGroup.children)) {
      const on = this.selection?.kind === 'edge' && this.selection.id === (group as SVGElement).dataset.edge;
      group.classList.toggle('is-selected', on);
      group.setAttribute('aria-pressed', String(on));
      const edge = this.edge((group as SVGElement).dataset.edge ?? '');
      const line = group.querySelector('.volcanic-edge-line');
      if (edge && line) this.applyMarkers(line, edge, on);
    }
  }

  private box(id: string): { cx: number; cy: number; hw: number; hh: number; shape: Shape } | null {
    const node = this.node(id);
    const el = this.nodeEls.get(id);
    if (!node || !el) return null;
    const hw = (el.offsetWidth || 140) / 2;
    const hh = (el.offsetHeight || 48) / 2;
    return { cx: node.x + hw, cy: node.y + hh, hw, hh, shape: node.shape };
  }

  private borderPoint(box: NonNullable<ReturnType<DiagramEditor['box']>>, tx: number, ty: number, gap = 3): { x: number; y: number } {
    const dx = tx - box.cx;
    const dy = ty - box.cy;
    if (!dx && !dy) return { x: box.cx, y: box.cy };
    let t: number;
    if (box.shape === 'diamond') t = 1 / (Math.abs(dx) / box.hw + Math.abs(dy) / box.hh);
    else if (box.shape === 'circle') t = 1 / Math.sqrt((dx / box.hw) ** 2 + (dy / box.hh) ** 2);
    else t = Math.min(box.hw / Math.abs(dx), box.hh / Math.abs(dy));
    const length = Math.hypot(dx, dy);
    const scale = t + gap / length;
    return { x: box.cx + dx * scale, y: box.cy + dy * scale };
  }

  private applyMarkers(line: Element, edge: DiagramEdge, selected: boolean): void {
    const url = `url(#${this.uid}-${selected ? 'arrow-selected' : 'arrow'})`;
    setAttrs(line, { 'marker-end': edge.arrow === 'none' ? null : url, 'marker-start': edge.arrow === 'both' ? url : null });
  }

  private drawEdges(): void {
    let width = this.wrap.clientWidth;
    let height = this.wrap.clientHeight;
    for (const node of this.diagram.nodes) {
      const el = this.nodeEls.get(node.id);
      width = Math.max(width, node.x + (el?.offsetWidth ?? 140) + 120);
      height = Math.max(height, node.y + (el?.offsetHeight ?? 48) + 120);
    }
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    setAttrs(this.edgeLayer, { width, height, viewBox: `0 0 ${width} ${height}` });

    const active = document.activeElement;
    const focused = active instanceof SVGElement && this.edgeGroup.contains(active) ? active.dataset.edge : undefined;
    this.edgeGroup.replaceChildren();

    const pairCount = new Map<string, number>();
    const pairSeen = new Map<string, number>();
    const pairKey = (e: DiagramEdge): string => [e.from, e.to].sort().join('\u0000');
    for (const edge of this.diagram.edges) pairCount.set(pairKey(edge), (pairCount.get(pairKey(edge)) ?? 0) + 1);

    for (const edge of this.diagram.edges) {
      const a = this.box(edge.from);
      const b = this.box(edge.to);
      if (!a || !b) continue;
      let d: string;
      let labelAt: { x: number; y: number };
      if (edge.from === edge.to) {
        const x = a.cx + a.hw + 3;
        d = `M${x},${a.cy - 10} C${x + 56},${a.cy - 46} ${x + 56},${a.cy + 46} ${x},${a.cy + 10}`;
        labelAt = { x: x + 52, y: a.cy };
      } else {
        const key = pairKey(edge);
        const total = pairCount.get(key) ?? 1;
        const index = pairSeen.get(key) ?? 0;
        pairSeen.set(key, index + 1);
        // Spread parallel connections apart; opposite directions bend opposite ways.
        const sign = edge.from < edge.to ? 1 : -1;
        const bend = (index - (total - 1) / 2) * 44 * sign;
        const mx = (a.cx + b.cx) / 2;
        const my = (a.cy + b.cy) / 2;
        const length = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1;
        const cx = mx + (-(b.cy - a.cy) / length) * bend;
        const cy = my + ((b.cx - a.cx) / length) * bend;
        const start = this.borderPoint(a, cx, cy, edge.arrow === 'both' ? 3 : 0);
        const end = this.borderPoint(b, cx, cy);
        d = `M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}`;
        labelAt = { x: 0.25 * start.x + 0.5 * cx + 0.25 * end.x, y: 0.25 * start.y + 0.5 * cy + 0.25 * end.y };
      }

      const selected = this.selection?.kind === 'edge' && this.selection.id === edge.id;
      const line = s('path', { d, class: `volcanic-edge-line is-${edge.line}` });
      this.applyMarkers(line, edge, selected);
      const label = edge.label.trim();
      const description = `Connection from ${this.nodeLabel(edge.from)} to ${this.nodeLabel(edge.to)}${label ? `, labelled ${plainLabel(label)}` : ''}.`;
      const group = s(
        'g',
        { class: `volcanic-edge${selected ? ' is-selected' : ''}`, tabindex: '0', role: 'button', 'data-edge': edge.id, 'aria-label': description, 'aria-pressed': String(selected) },
        s('path', { d, class: 'volcanic-edge-hit' }),
        line,
      );
      if (label) {
        // Beside the line, not on it: above a line that runs across, to the right of one that runs up and down.
        const across = edge.from === edge.to ? false : Math.abs(b.cx - a.cx) >= Math.abs(b.cy - a.cy);
        const at = across ? { x: labelAt.x, y: labelAt.y - 11 } : { x: labelAt.x + 9, y: labelAt.y };
        const text = s('text', { x: at.x, y: at.y, class: 'volcanic-edge-label', 'text-anchor': across ? 'middle' : 'start', 'dominant-baseline': 'middle' });
        text.textContent = plainLabel(label);
        group.append(text);
      }
      group.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.select({ kind: 'edge', id: edge.id });
      });
      group.addEventListener('focus', () => this.select({ kind: 'edge', id: edge.id }));
      group.addEventListener('keydown', (event) => this.onEdgeKeydown(event, edge.id));
      this.edgeGroup.append(group);
    }
    if (focused) this.edgeGroup.querySelector<SVGElement>(`[data-edge="${focused}"]`)?.focus({ preventScroll: true });
  }

  private focusNode(id: string): void {
    const el = this.nodeEls.get(id);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private canvasPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // ───────────────────────────── Pointer interaction ─────────────────────────────

  private startNodeDrag(event: PointerEvent, id: string): void {
    if (event.button !== 0 || isTextField(event.target)) return;
    if ((event.target as HTMLElement).classList.contains('volcanic-node-handle')) return;
    const node = this.node(id);
    const el = this.nodeEls.get(id);
    if (!node || !el) return;

    if (this.connectArmed) {
      event.preventDefault();
      if (!this.connectFrom) this.beginConnection(id);
      else this.completeConnection(id);
      return;
    }

    const origin = { x: event.clientX, y: event.clientY, nodeX: node.x, nodeY: node.y };
    let moved = false;
    el.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent): void => {
      const dx = move.clientX - origin.x;
      const dy = move.clientY - origin.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      el.classList.add('is-dragging');
      // Line up with nearby shapes first, fall back to the grid. Alt turns alignment off.
      const aligned = move.altKey ? null : this.alignToOthers(id, origin.nodeX + dx, origin.nodeY + dy);
      node.x = aligned?.x ?? snap(origin.nodeX + dx);
      node.y = aligned?.y ?? snap(origin.nodeY + dy);
      alignedWith = aligned?.names ?? [];
      this.placeNode(node);
      this.drawEdges();
      this.drawGuides(aligned?.guides ?? []);
    };
    let alignedWith: string[] = [];
    const onUp = (): void => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.classList.remove('is-dragging');
      this.drawGuides([]);
      if (!moved) return;
      this.commit();
      this.renderOutput();
      this.renderToolbarState();
      this.syncPositionFields(node);
      const alignment = alignedWith.length ? ` Aligned with ${alignedWith.join(' and ')}.` : '';
      this.announce(`${plainLabel(node.label)} moved to ${node.x}, ${node.y}.${alignment}`);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  /**
   * Snap a dragged shape so its edges or centre line up with another shape's.
   * Each axis snaps on its own; an axis with nothing nearby falls back to the grid.
   */
  private alignToOthers(id: string, rawX: number, rawY: number): { x: number; y: number; guides: Guide[]; names: string[] } | null {
    const el = this.nodeEls.get(id);
    if (!el) return null;
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    const others = this.diagram.nodes
      .filter((n) => n.id !== id)
      .map((n) => {
        const o = this.nodeEls.get(n.id);
        return { node: n, w: o?.offsetWidth ?? 140, h: o?.offsetHeight ?? 48 };
      });

    // For one axis: the smallest shift that lines up a start, middle or end.
    const best = (raw: number, size: number, axis: 'x' | 'y'): { value: number; line: number } | null => {
      let found: { value: number; line: number; delta: number } | null = null;
      for (const other of others) {
        const start = other.node[axis];
        const otherSize = axis === 'x' ? other.w : other.h;
        // Centres are tried first so they win a tie between same-sized shapes.
        for (const fraction of [0.5, 0, 1]) {
          const line = start + otherSize * fraction;
          const delta = line - (raw + size * fraction);
          if (Math.abs(delta) <= ALIGN_DISTANCE && (!found || Math.abs(delta) < Math.abs(found.delta))) {
            found = { value: raw + delta, line, delta };
          }
        }
      }
      return found && found.value >= 0 ? found : null;
    };

    const ax = best(rawX, w, 'x');
    const ay = best(rawY, hgt, 'y');
    if (!ax && !ay) return null;
    const x = ax ? Math.round(ax.value) : snap(rawX);
    const y = ay ? Math.round(ay.value) : snap(rawY);

    const guides: Guide[] = [];
    const names = new Set<string>();
    const onLine = (line: number, start: number, size: number): boolean => [0, 0.5, 1].some((f) => Math.abs(start + size * f - line) < 1);
    if (ax) {
      let from = y;
      let to = y + hgt;
      for (const other of others) {
        if (!onLine(ax.line, other.node.x, other.w)) continue;
        from = Math.min(from, other.node.y);
        to = Math.max(to, other.node.y + other.h);
        names.add(plainLabel(other.node.label));
      }
      guides.push({ x1: ax.line, y1: from - 16, x2: ax.line, y2: to + 16 });
    }
    if (ay) {
      let from = x;
      let to = x + w;
      for (const other of others) {
        if (!onLine(ay.line, other.node.y, other.h)) continue;
        from = Math.min(from, other.node.x);
        to = Math.max(to, other.node.x + other.w);
        names.add(plainLabel(other.node.label));
      }
      guides.push({ x1: from - 16, y1: ay.line, x2: to + 16, y2: ay.line });
    }
    return { x, y, guides, names: Array.from(names).slice(0, 2) };
  }

  private drawGuides(guides: Guide[]): void {
    this.guideGroup.replaceChildren(...guides.map((g) => s('line', { ...g, class: 'volcanic-guide' })));
  }

  private startHandleDrag(event: PointerEvent, id: string): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const source = this.box(id);
    const handle = event.currentTarget as HTMLElement;
    if (!source) return;
    handle.setPointerCapture(event.pointerId);
    this.select({ kind: 'node', id });
    this.root.classList.add('is-connecting');
    let target: string | null = null;

    const targetAt = (e: PointerEvent): string | null => {
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-node]');
      return hit && this.canvas.contains(hit) ? hit.dataset.node ?? null : null;
    };
    const onMove = (move: PointerEvent): void => {
      const point = this.canvasPoint(move);
      const start = this.borderPoint(source, point.x, point.y);
      this.dragLine.style.display = '';
      this.dragLine.setAttribute('d', `M${start.x},${start.y} L${point.x},${point.y}`);
      const next = targetAt(move);
      if (next !== target) {
        if (target) this.nodeEls.get(target)?.classList.remove('is-drop-target');
        target = next;
        if (target) this.nodeEls.get(target)?.classList.add('is-drop-target');
      }
    };
    const onUp = (up: PointerEvent): void => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      this.dragLine.style.display = 'none';
      this.root.classList.remove('is-connecting');
      const to = up.type === 'pointerup' ? targetAt(up) : null;
      if (target) this.nodeEls.get(target)?.classList.remove('is-drop-target');
      if (to) {
        const edge = this.addEdge(id, to);
        if (edge) this.select({ kind: 'edge', id: edge.id });
      }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  private startPaletteDrag(event: PointerEvent, shape: Shape): void {
    if (event.button !== 0) return;
    const button = event.currentTarget as HTMLElement;
    const origin = { x: event.clientX, y: event.clientY };
    let ghost: HTMLElement | null = null;
    // Capture straight away so moves keep arriving once the pointer leaves the button.
    button.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent): void => {
      if (!ghost) {
        if (Math.hypot(move.clientX - origin.x, move.clientY - origin.y) < 6) return;
        ghost = h('div', { class: 'volcanic-ghost', attrs: { 'aria-hidden': 'true' } }, shapeIcon(shape), h('span', { text: shapeName(shape) }));
        this.root.append(ghost);
      }
      const rect = this.root.getBoundingClientRect();
      ghost.style.left = `${move.clientX - rect.left}px`;
      ghost.style.top = `${move.clientY - rect.top}px`;
    };
    const onUp = (up: PointerEvent): void => {
      button.removeEventListener('pointermove', onMove);
      button.removeEventListener('pointerup', onUp);
      button.removeEventListener('pointercancel', onUp);
      if (!ghost) return;
      ghost.remove();
      this.suppressClick = true;
      window.setTimeout(() => (this.suppressClick = false), 0);
      const rect = this.wrap.getBoundingClientRect();
      const inside = up.clientX >= rect.left && up.clientX <= rect.right && up.clientY >= rect.top && up.clientY <= rect.bottom;
      if (up.type === 'pointerup' && inside) {
        const point = this.canvasPoint(up);
        this.addNode(shape, { x: point.x - 70, y: point.y - 24 });
      }
    };
    button.addEventListener('pointermove', onMove);
    button.addEventListener('pointerup', onUp);
    button.addEventListener('pointercancel', onUp);
  }

  // ───────────────────────────── Keyboard ─────────────────────────────

  private onRootKeydown(event: KeyboardEvent): void {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key === 'Enter') {
      event.preventDefault();
      this.submit();
      return;
    }
    if (event.key === 'Escape' && this.cancelTransient()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === 'Escape' && this.host.inline) {
      event.preventDefault();
      event.stopPropagation();
      this.host.onCancel();
      return;
    }
    if (this.mode !== 'visual' || isTextField(event.target)) return;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
    } else if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
    }
  }

  private onNodeKeydown(event: KeyboardEvent, id: string): void {
    if (event.target !== event.currentTarget) return;
    const mod = event.metaKey || event.ctrlKey;
    const step = event.shiftKey ? 50 : event.altKey ? 1 : GRID;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key] && !mod) {
      event.preventDefault();
      this.moveNode(id, ...moves[event.key]);
      return;
    }
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (this.connectFrom) this.completeConnection(id);
        else if (this.connectArmed) this.beginConnection(id);
        else if (event.key === 'Enter') this.startInlineEdit(id);
        break;
      case 'F2':
        event.preventDefault();
        this.startInlineEdit(id);
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        this.select({ kind: 'node', id });
        this.deleteSelected();
        break;
      case 'c':
      case 'C':
        if (mod) break;
        event.preventDefault();
        this.beginConnection(id);
        break;
      case 'd':
      case 'D':
        if (!mod) break;
        event.preventDefault();
        this.duplicateSelected();
        break;
    }
  }

  private onEdgeKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.select({ kind: 'edge', id });
      this.deleteSelected();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select({ kind: 'edge', id });
      this.sideTabs.select('properties');
      this.inspector.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
  }

  // ───────────────────────────── Inline label editing ─────────────────────────────

  private startInlineEdit(id: string): void {
    const node = this.node(id);
    const el = this.nodeEls.get(id);
    if (!node || !el || this.inlineEdit) return;
    const field = h('textarea', {
      class: 'volcanic-node-editor',
      attrs: { rows: '1', 'aria-label': `Name for ${shapeName(node.shape).toLowerCase()} shape. Enter saves, Escape cancels.` },
      on: {
        keydown: (event) => {
          event.stopPropagation();
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.finishInlineEdit(true);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            this.finishInlineEdit(false);
          }
        },
        blur: () => this.finishInlineEdit(true),
        pointerdown: (event) => event.stopPropagation(),
        dblclick: (event) => event.stopPropagation(),
      },
    });
    field.value = node.label;
    el.classList.add('is-editing');
    el.append(field);
    this.inlineEdit = { id, field };
    field.focus();
    field.select();
  }

  private finishInlineEdit(save: boolean): void {
    const edit = this.inlineEdit;
    if (!edit) return;
    this.inlineEdit = null;
    const node = this.node(edit.id);
    const value = edit.field.value.trim();
    const hadFocus = document.activeElement === edit.field;
    edit.field.remove();
    this.nodeEls.get(edit.id)?.classList.remove('is-editing');
    if (node && save && value !== node.label) {
      node.label = value;
      this.changed();
      this.announce(`Renamed to ${plainLabel(value)}.`);
    }
    if (hadFocus) this.focusNode(edit.id);
  }

  // ───────────────────────────── Side panels ─────────────────────────────

  private field(label: string, control: HTMLElement, hint?: string): HTMLElement {
    const id = control.id || uniqueId('volcanic-field');
    control.id = id;
    const wrap = h('div', { class: 'volcanic-field' }, h('label', { text: label, attrs: { for: id } }), control);
    if (hint) {
      const hintId = `${id}-hint`;
      control.setAttribute('aria-describedby', hintId);
      wrap.append(h('p', { class: 'volcanic-hint', text: hint, attrs: { id: hintId } }));
    }
    return wrap;
  }

  private selectControl<T extends string>(options: { id: T; name: string }[], value: T, onChange: (value: T) => void): HTMLSelectElement {
    const select = h('select', { class: 'dropdown volcanic-select', on: { change: () => onChange(select.value as T) } });
    for (const option of options) select.append(h('option', { text: option.name, attrs: { value: option.id } }));
    select.value = value;
    return select;
  }

  private syncPositionFields(node: DiagramNode): void {
    const x = this.inspector.querySelector<HTMLInputElement>('[data-pos="x"]');
    const y = this.inspector.querySelector<HTMLInputElement>('[data-pos="y"]');
    if (x && document.activeElement !== x) x.value = String(node.x);
    if (y && document.activeElement !== y) y.value = String(node.y);
  }

  private renderInspector(): void {
    const selected = this.findSelected();
    this.inspector.replaceChildren();
    if (!selected || !this.selection) {
      this.inspector.append(this.inspectorIntro());
    } else if (this.selection.kind === 'node') {
      this.inspector.append(...this.nodeInspector(selected as DiagramNode));
    } else {
      this.inspector.append(...this.edgeInspector(selected as DiagramEdge));
    }
  }

  private inspectorIntro(): HTMLElement {
    const shortcuts: [string, string][] = [
      ['Tab', 'Move between shapes and connections'],
      ['Arrow keys', 'Move the focused shape (Shift for bigger steps)'],
      ['Enter', 'Rename the focused shape'],
      ['C, then Enter', 'Connect the focused shape to another'],
      ['Delete', 'Remove the focused shape or connection'],
      ['Ctrl/Cmd + Z', 'Undo (add Shift to redo)'],
      ['Ctrl/Cmd + Enter', 'Finish and insert the diagram'],
    ];
    const list = h('dl', { class: 'volcanic-shortcuts' });
    for (const [keys, what] of shortcuts) list.append(h('dt', {}, h('kbd', { text: keys })), h('dd', { text: what }));
    return h(
      'div',
      { class: 'volcanic-intro' },
      h('p', { text: 'Select a shape or connection to edit it. Drag shapes to arrange them, and drag the dot on a shape’s edge to connect it to another.' }),
      h('details', { class: 'volcanic-details-toggle' }, h('summary', { text: 'Keyboard shortcuts' }), list),
    );
  }

  private nodeInspector(node: DiagramNode): HTMLElement[] {
    const label = h('textarea', {
      class: 'volcanic-input',
      attrs: { rows: '2', 'data-autofocus': true },
      on: {
        input: () => {
          node.label = label.value;
          this.changed({ tag: `label:${node.id}`, inspector: false });
        },
      },
    });
    label.value = node.label;

    const groupName = uniqueId('volcanic-shape');
    const shapes = h('fieldset', { class: 'volcanic-shape-picker' }, h('legend', { text: 'Shape' }));
    for (const shape of SHAPES) {
      const input = h('input', {
        class: 'volcanic-sr-only',
        attrs: { type: 'radio', name: groupName, value: shape.id },
        on: {
          change: () => {
            node.shape = shape.id;
            this.changed({ inspector: false });
            this.announce(`Shape changed to ${shape.name}.`);
          },
        },
      });
      input.checked = node.shape === shape.id;
      shapes.append(h('label', { class: 'volcanic-shape-option', attrs: { title: shape.hint } }, input, shapeIcon(shape.id), h('span', { text: shape.name })));
    }

    const position = (axis: 'x' | 'y'): HTMLInputElement => {
      const input = h('input', {
        class: 'volcanic-input',
        attrs: { type: 'number', min: '0', step: String(GRID), 'data-pos': axis, inputmode: 'numeric' },
        on: {
          input: () => {
            const value = Number(input.value);
            if (!Number.isFinite(value)) return;
            node[axis] = Math.max(0, Math.round(value));
            this.commit(`pos:${node.id}`);
            this.placeNode(node);
            this.drawEdges();
            this.renderOutput();
            this.renderToolbarState();
          },
        },
      });
      input.value = String(node[axis]);
      return input;
    };
    const positionRow = h(
      'fieldset',
      { class: 'volcanic-row' },
      h('legend', { text: 'Position on canvas' }),
      this.field('Across', position('x')),
      this.field('Down', position('y')),
    );

    // Connections
    const connections = h('div', { class: 'volcanic-subsection' }, h('h4', { text: 'Connections' }));
    const related = this.diagram.edges.filter((e) => e.from === node.id || e.to === node.id);
    if (related.length) {
      const list = h('ul', { class: 'volcanic-list' });
      for (const edge of related) {
        const outgoing = edge.from === node.id;
        const other = this.nodeLabel(outgoing ? edge.to : edge.from);
        const text = `${outgoing ? 'To' : 'From'} ${other}${edge.label.trim() ? ` (${plainLabel(edge.label)})` : ''}`;
        list.append(
          h('li', {}, h('button', { class: 'volcanic-list-item', text, attrs: { type: 'button', 'aria-label': `${text}. Edit connection.` }, on: { click: () => this.selectAndEdit({ kind: 'edge', id: edge.id }) } })),
        );
      }
      connections.append(list);
    } else {
      connections.append(h('p', { class: 'volcanic-hint', text: 'Not connected yet.' }));
    }
    const others = this.diagram.nodes.filter((n) => n.id !== node.id);
    if (others.length) {
      const target = this.selectControl(
        others.map((n) => ({ id: n.id, name: plainLabel(n.label) })),
        others[0].id,
        () => undefined,
      );
      const add = this.iconButton('Connect', 'plus', () => {
        const edge = this.addEdge(node.id, target.value);
        if (edge) this.selectAndEdit({ kind: 'edge', id: edge.id });
      });
      connections.append(h('div', { class: 'volcanic-connect-row' }, this.field('Connect to', target), add));
    }

    const actions = h(
      'div',
      { class: 'volcanic-actions' },
      this.iconButton('Duplicate', 'copy', () => this.duplicateSelected()),
      this.iconButton('Delete', 'trash-2', () => this.deleteSelected(), 'mod-warning'),
    );

    return [h('h3', { class: 'volcanic-panel-title', text: 'Shape' }), this.field('Name', label, 'Press Enter for a new line.'), shapes, positionRow, connections, actions];
  }

  private edgeInspector(edge: DiagramEdge): HTMLElement[] {
    const nodeOptions = this.diagram.nodes.map((n) => ({ id: n.id, name: plainLabel(n.label) }));
    const from = this.selectControl(nodeOptions, edge.from, (value) => {
      edge.from = value;
      this.changed({ inspector: false });
    });
    const to = this.selectControl(nodeOptions, edge.to, (value) => {
      edge.to = value;
      this.changed({ inspector: false });
    });
    const swap = this.iconButton('Reverse direction', 'arrow-left-right', () => {
      [edge.from, edge.to] = [edge.to, edge.from];
      this.changed();
      this.announce(`Now from ${this.nodeLabel(edge.from)} to ${this.nodeLabel(edge.to)}.`);
    });
    const label = h('input', {
      class: 'volcanic-input',
      attrs: { type: 'text', 'data-autofocus': true },
      on: {
        input: () => {
          edge.label = label.value;
          this.changed({ tag: `label:${edge.id}`, inspector: false });
        },
      },
    });
    label.value = edge.label;
    const line = this.selectControl<LineStyle>(LINE_STYLES, edge.line, (value) => {
      edge.line = value;
      this.changed({ inspector: false });
    });
    const arrow = this.selectControl<ArrowStyle>(ARROW_STYLES, edge.arrow, (value) => {
      edge.arrow = value;
      this.changed({ inspector: false });
    });
    return [
      h('h3', { class: 'volcanic-panel-title', text: 'Connection' }),
      this.field('Label', label, 'Optional text shown on the line.'),
      h('div', { class: 'volcanic-row' }, this.field('From', from), this.field('To', to)),
      swap,
      h('div', { class: 'volcanic-row' }, this.field('Line', line), this.field('Ends', arrow)),
      h('div', { class: 'volcanic-actions' }, this.iconButton('Delete', 'trash-2', () => this.deleteSelected(), 'mod-warning')),
    ];
  }

  private selectAndEdit(selection: NonNullable<Selection>): void {
    this.selection = selection;
    this.updateSelectionClasses();
    this.renderInspector();
    this.sideTabs.select('properties');
    this.inspector.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  private renderOutline(): void {
    this.outline.replaceChildren();
    const { nodes, edges } = this.diagram;
    if (!nodes.length) {
      this.outline.append(h('p', { class: 'volcanic-hint', text: 'The outline lists every shape and connection as text. It is empty until you add a shape.' }));
      return;
    }
    const nodeList = h('ul', { class: 'volcanic-list' });
    for (const node of nodes) {
      nodeList.append(
        h(
          'li',
          {},
          h(
            'button',
            { class: 'volcanic-list-item', attrs: { type: 'button', 'aria-label': `${this.describeNode(node)} Edit shape.` }, on: { click: () => this.selectAndEdit({ kind: 'node', id: node.id }) } },
            shapeIcon(node.shape),
            h('span', { text: plainLabel(node.label) }),
          ),
        ),
      );
    }
    this.outline.append(h('h3', { class: 'volcanic-panel-title', text: `Shapes (${nodes.length})` }), nodeList);

    this.outline.append(h('h3', { class: 'volcanic-panel-title', text: `Connections (${edges.length})` }));
    if (!edges.length) {
      this.outline.append(h('p', { class: 'volcanic-hint', text: 'No connections yet.' }));
      return;
    }
    const edgeList = h('ul', { class: 'volcanic-list' });
    for (const edge of edges) {
      const symbol = edge.arrow === 'both' ? '↔' : edge.arrow === 'none' ? '—' : '→';
      const words = edge.arrow === 'both' ? 'both ways with' : edge.arrow === 'none' ? 'joined to' : 'to';
      const label = edge.label.trim() ? `, labelled ${plainLabel(edge.label)}` : '';
      edgeList.append(
        h(
          'li',
          {},
          h('button', {
            class: 'volcanic-list-item',
            text: `${this.nodeLabel(edge.from)} ${symbol} ${this.nodeLabel(edge.to)}${edge.label.trim() ? ` · ${plainLabel(edge.label)}` : ''}`,
            attrs: { type: 'button', 'aria-label': `${this.nodeLabel(edge.from)} ${words} ${this.nodeLabel(edge.to)}${label}. Edit connection.` },
            on: { click: () => this.selectAndEdit({ kind: 'edge', id: edge.id }) },
          }),
        ),
      );
    }
    this.outline.append(edgeList);
  }

  private renderToolbarState(): void {
    const kind = this.kind !== 'flowchart' ? this.kindEditor : null;
    this.undoButton.setAttribute('aria-disabled', String(kind ? !kind.canUndo() : this.historyIndex <= 0));
    this.redoButton.setAttribute('aria-disabled', String(kind ? !kind.canRedo() : this.historyIndex >= this.history.length - 1));
    this.directionSelect.value = this.diagram.direction;
    this.kindSelect.value = this.kind;
    this.kindField.hidden = !this.canChangeKind();
    if (this.mode === 'visual' && this.kind === 'flowchart') {
      if (document.activeElement !== this.titleField) this.titleField.value = this.diagram.title;
      if (document.activeElement !== this.descriptionField) this.descriptionField.value = this.diagram.description;
      this.titleAlignSelect.value = this.diagram.titleAlign;
    }
  }

  // ───────────────────────────── Output ─────────────────────────────

  private renderOutput(): void {
    this.updateTitleNote();
    if (this.mode === 'visual') this.codeView.textContent = this.getSource() || 'Nothing to show yet.';
    this.schedulePreview();
  }

  private schedulePreview(): void {
    window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.renderPreview(), 120);
  }

  private showPreviewMessage(message: string, isError: boolean): void {
    this.previewMessage.textContent = message;
    this.previewMessage.classList.toggle('is-error', isError);
    this.previewMessage.hidden = !message;
  }

  private renderPreview(): void {
    const source = stripMeta(this.getSource()).trim();
    if (!source) {
      this.previewHost.hidden = true;
      this.showPreviewMessage(this.mode === 'visual' ? 'Your diagram will appear here as you build it.' : 'Type Mermaid source or choose a template to see a preview.', false);
      return;
    }
    let failure: unknown = null;
    const align = this.titleAlignSelect.value as TitleAlign;
    const options = {
      zoom: false as const,
      // A chosen text size makes Pele draw (and lay out) the diagram with it.
      ...(this.fontSize || this.host.defaultFontSize ? { fontSize: this.fontSize || this.host.defaultFontSize } : {}),
      // Pele redraws on its own at times, so re-apply the position whenever it does.
      onRender: () => this.finishPreview(align),
      onError: (error: unknown) => {
        failure = error;
      },
    };
    try {
      if (this.mounted) this.mounted.update(source, options);
      else this.mounted = mount(this.previewHost, source, options);
      failure = failure ?? this.mounted.error ?? null;
    } catch (error) {
      failure = error;
    }
    if (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      this.previewHost.hidden = true;
      this.showPreviewMessage(`Pele could not draw this diagram.\n${message}`, true);
      return;
    }
    this.previewHost.hidden = false;
    this.showPreviewMessage('', false);
    this.finishPreview(align);
    const svg = this.previewHost.querySelector('svg');
    if (svg && !svg.hasAttribute('aria-labelledby')) {
      const title = this.titleField.value.trim();
      svg.setAttribute('aria-label', title ? `Preview: ${title}` : 'Preview of an untitled diagram');
    }
  }

  /** Adjustments made to Pele's drawing, matching what notes show. */
  private finishPreview(align: TitleAlign): void {
    // Labels first: moving them can widen the picture, and the title aligns to its edges.
    if (this.host.labelsBesideLines) placeEdgeLabels(this.previewHost);
    alignTitle(this.previewHost, align);
    const source = this.getSource();
    setTaskDetails(this.previewHost, source, true);
    setHolidayBands(this.previewHost, source, { legend: false });
    setDescription(this.previewHost, readDescription(source), align);
  }

  private submit(): void {
    if (this.inlineEdit) this.finishInlineEdit(true);
    const source = this.getSource();
    if (!source) {
      this.announce(this.mode === 'visual' ? 'Add at least one shape first.' : 'Type some Mermaid source first.');
      return;
    }
    this.host.onSubmit(source);
  }
}
