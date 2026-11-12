import { App, Component, Editor, MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownView, Menu, Modal, Notice, Plugin, PluginSettingTab, Setting, SettingGroup, TFile, setIcon } from 'obsidian';
import * as obsidianModule from 'obsidian';
import { mount, type Mounted } from 'pele';
import { DiagramEditor } from './editor';
import { readFontSize, readTheme, readTitle, readTitleAlign, stripMeta, TEXT_SIZES } from './mermaid';
import { DEFAULT_THEME_ID, THEMES, themeCss } from './themes';
import { resizeHandle } from './ui';
import { readDescription } from './kinds';
import { alignTitle } from './title';
import { setDescription } from './description';
import { setTaskDetails } from './taskDetails';
import { setHolidayBands } from './holidayBands';
import { placeEdgeLabels } from './labels';

interface VolcanicSettings {
  /** Draw mermaid blocks in notes with the bundled Pele instead of Obsidian's renderer. */
  renderInNotes: boolean;
  /** Draw connection labels beside their lines rather than on top of them. */
  labelsBesideLines: boolean;
  /** Edit diagrams inside the note instead of in a pop-up window. */
  editInPlace: boolean;
  /** Show each diagram's description as a caption underneath. */
  showDescription: boolean;
  /** Colour theme for diagrams that have not chosen one. Empty follows Obsidian. */
  defaultTheme: string;
  /** Scale diagrams to the width of the note instead of leaving them at Pele's fixed size. */
  fitWidth: boolean;
  /** Draw assignee, status and percent complete on Gantt tasks. */
  showTaskDetails: boolean;
  /** Text size in pixels for diagrams that have not chosen one. 0 keeps Pele's own size. */
  textSize: number;
}

const DEFAULT_SETTINGS: VolcanicSettings = { renderInNotes: true, labelsBesideLines: true, editInPlace: true, showDescription: true, defaultTheme: '', fitWidth: true, showTaskDetails: true, textSize: 0 };

/** Where a rendered diagram lives in its note, and how to change it. */
interface BlockHandle {
  source: string;
  write(source: string): void;
  remove(): void;
}

/** Frees Pele's listeners when the rendered block leaves the page. */
class PeleBlock extends MarkdownRenderChild {
  constructor(el: HTMLElement, private readonly mounted: Mounted) {
    super(el);
  }

  onunload(): void {
    this.mounted.destroy();
  }
}

interface BlockRange {
  /** Line of the opening fence. */
  start: number;
  /** Line of the closing fence. */
  end: number;
  source: string;
}

const OPEN_FENCE = /^(\s*)(`{3,}|~{3,})\s*mermaid\s*$/i;

/** The mermaid code block containing `line`, if any. */
function findBlock(lines: string[], line: number): BlockRange | null {
  for (let start = Math.min(line, lines.length - 1); start >= 0; start--) {
    const open = OPEN_FENCE.exec(lines[start]);
    if (!open) {
      // Stop at any other fence between here and the cursor: we are not inside a mermaid block.
      if (start !== line && /^\s*(`{3,}|~{3,})/.test(lines[start])) return null;
      continue;
    }
    const close = new RegExp(`^\\s*${open[2][0]}{${open[2].length},}\\s*$`);
    for (let end = start + 1; end < lines.length; end++) {
      if (close.test(lines[end])) {
        return line <= end ? { start, end, source: lines.slice(start + 1, end).join('\n') } : null;
      }
    }
    return null;
  }
  return null;
}

function fenced(source: string): string {
  return '```mermaid\n' + source + '\n```';
}

class DiagramModal extends Modal {
  private editor: DiagramEditor | null = null;
  private confirmed = false;
  private returnFocus: HTMLElement | null = null;

  constructor(app: App, private readonly source: string | null, private readonly options: { labelsBesideLines: boolean; defaultTheme: string; textSize: number }, private readonly onSubmit: (source: string) => void, private readonly startInCode = false) {
    super(app);
  }

  onOpen(): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const titleId = 'volcanic-modal-title';
    this.modalEl.addClass('volcanic-modal');
    this.modalEl.setAttribute('role', 'dialog');
    this.modalEl.setAttribute('aria-modal', 'true');
    this.modalEl.setAttribute('aria-labelledby', titleId);
    this.titleEl.id = titleId;
    this.titleEl.setText(this.source ? 'Edit diagram' : 'New diagram');
    this.modalEl.querySelector('.modal-close-button')?.setAttribute('aria-label', 'Close');

    this.editor = new DiagramEditor(
      this.contentEl,
      {
        setIcon,
        submitLabel: this.source ? 'Update diagram' : 'Insert diagram',
        labelsBesideLines: this.options.labelsBesideLines,
        defaultTheme: this.options.defaultTheme,
        defaultFontSize: this.options.textSize,
        startInCode: this.startInCode,
        onSubmit: (source) => {
          this.confirmed = true;
          this.close();
          this.onSubmit(source);
        },
        onCancel: () => this.close(),
      },
      this.source,
    );
    // A bar at the bottom of the window to make it taller or shorter.
    this.modalEl.append(resizeHandle(this.modalEl, { min: 520, max: () => window.innerHeight - 24, storageKey: 'volcanic-modal-height' }));
    this.modalEl.addEventListener('keydown', this.trapFocus);
    window.setTimeout(() => this.editor?.focus(), 0);
  }

  /** Keep Tab inside the dialog. */
  private trapFocus = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      this.modalEl.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  close(): void {
    // Escape first backs out of a rename or a half-made connection.
    if (!this.confirmed && this.editor?.cancelTransient()) return;
    if (!this.confirmed && this.editor?.isDirty()) {
      new ConfirmModal(this.app, 'Discard changes?', 'Your changes to this diagram have not been inserted into the note.', 'Discard', () => {
        this.confirmed = true;
        this.close();
      }).open();
      return;
    }
    super.close();
  }

  onClose(): void {
    this.modalEl.removeEventListener('keydown', this.trapFocus);
    this.editor?.destroy();
    this.editor = null;
    this.contentEl.empty();
    this.returnFocus?.focus();
  }
}

class ConfirmModal extends Modal {
  constructor(app: App, private readonly heading: string, private readonly message: string, private readonly action: string, private readonly onConfirm: () => void) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    this.contentEl.createEl('p', { text: this.message });
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const keep = buttons.createEl('button', { text: 'Keep editing' });
    keep.addEventListener('click', () => this.close());
    const confirm = buttons.createEl('button', { text: this.action, cls: 'mod-warning' });
    confirm.addEventListener('click', () => {
      this.close();
      this.onConfirm();
    });
    keep.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export default class VolcanicPlugin extends Plugin {
  settings: VolcanicSettings = DEFAULT_SETTINGS;
  private readonly contexts = new WeakMap<HTMLElement, MarkdownPostProcessorContext>();
  /** What was just saved from an editor, until the note's text catches up. Obsidian can redraw before it has. */
  private readonly justSaved = new WeakMap<HTMLElement, { text: string; at: number }>();
  private readonly redraws = new WeakMap<HTMLElement, () => void>();

  async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<VolcanicSettings> | null) };
    this.addSettingTab(new VolcanicSettingTab(this.app, this));
    // Colour themes: one rule set per theme, switched on by a data attribute on each diagram.
    const style = document.head.createEl('style', { attr: { 'data-volcanic-themes': '' } });
    style.textContent = themeCss();
    this.register(() => style.remove());

    if (this.settings.renderInNotes) {
      try {
        this.registerMarkdownCodeBlockProcessor('mermaid', (source, el, ctx) => this.renderBlock(source, el, ctx));
      } catch (error) {
        // Another plugin already draws mermaid blocks; leave it to that one.
        console.warn('Volcanic: could not take over mermaid rendering.', error);
        new Notice('Volcanic could not take over diagram rendering because another plugin already does. The editor still works.');
      }
    }

    this.addRibbonIcon('workflow', 'Create or edit Mermaid diagram', () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        new Notice('Open a note to add a diagram.');
        return;
      }
      this.openForEditor(view.editor);
    });

    this.addCommand({
      id: 'create-or-edit-diagram',
      name: 'Create or edit diagram at cursor',
      editorCallback: (editor) => this.openForEditor(editor),
    });

    this.addCommand({
      id: 'edit-diagram-source',
      name: 'Edit diagram source at cursor',
      editorCheckCallback: (checking, editor) => {
        const inBlock = !!findBlock(editor.getValue().split('\n'), editor.getCursor().line);
        if (inBlock && !checking) this.openForEditor(editor, editor.getCursor().line, true);
        return inBlock;
      },
    });

    this.addCommand({
      id: 'insert-diagram',
      name: 'Insert new diagram',
      editorCallback: (editor) => this.insertNew(editor),
    });

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        const inBlock = !!findBlock(editor.getValue().split('\n'), editor.getCursor().line);
        menu.addItem((item) =>
          item
            .setTitle(inBlock ? 'Edit in Volcanic' : 'Insert diagram with Volcanic')
            .setIcon('workflow')
            .onClick(() => this.openForEditor(editor)),
        );
        if (inBlock) {
          menu.addItem((item) =>
            item
              .setTitle('Edit source in Volcanic')
              .setIcon('code')
              .onClick(() => this.openForEditor(editor, editor.getCursor().line, true)),
          );
        }
      }),
    );

    this.registerMarkdownPostProcessor((el, ctx) => this.addEditButton(el, ctx));
    this.watchLivePreview();
  }

  private openForEditor(editor: Editor, line = editor.getCursor().line, code = false): void {
    const block = findBlock(editor.getValue().split('\n'), line);
    if (!block) {
      this.insertNew(editor);
      return;
    }
    if (!this.settings.editInPlace) {
      this.openModalFor(editor, block, code);
      return;
    }
    void this.editBlockInline(editor, block, code).then((ok) => {
      if (!ok) this.openModalFor(editor, block, code);
    });
  }

  /** The note's editor, if it is showing Live Preview (where diagrams are drawn in place and can be edited there). */
  private livePreviewView(editor: Editor): MarkdownView | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.editor !== editor || view.getMode() !== 'source') return null;
    return (view.getState() as { source?: boolean }).source ? null : view;
  }

  /** Wait for Obsidian to draw the diagram that starts on `startLine`. */
  private async waitForWidget(view: MarkdownView, startLine: number): Promise<HTMLElement | null> {
    for (let attempt = 0; attempt < 30; attempt++) {
      const lines = view.editor.getValue().split('\n');
      for (const el of Array.from(view.contentEl.querySelectorAll<HTMLElement>('.volcanic-has-edit'))) {
        const located = this.lineInActiveEditor(el);
        if (located && findBlock(lines, located.line)?.start === startLine && this.contexts.has(el)) return el;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    return null;
  }

  /** Edit an existing block in place: move the cursor out so Obsidian draws it, then open the editor over it. */
  private async editBlockInline(editor: Editor, block: BlockRange, code = false): Promise<boolean> {
    const view = this.livePreviewView(editor);
    if (!view) return false;
    this.ensureLineAfter(editor, block.start);
    editor.setCursor({ line: Math.min(block.end + 1, editor.lastLine()), ch: 0 });
    const el = await this.waitForWidget(view, block.start);
    const ctx = el ? this.contexts.get(el) : undefined;
    if (!el || !ctx) return false;
    this.editInline(el, ctx, false, code);
    return true;
  }

  /** Insert a new diagram in place: add an empty block, let Obsidian draw it, then open the editor over it. */
  private async insertNewInline(editor: Editor): Promise<boolean> {
    const view = this.livePreviewView(editor);
    if (!view) return false;
    const cursor = editor.getCursor();
    const current = editor.getLine(cursor.line);
    const blank = current.trim() === '';
    const at = { line: cursor.line, ch: blank ? 0 : current.length };
    editor.replaceRange(`${blank ? '' : '\n\n'}\`\`\`mermaid\n\n\`\`\`\n`, at, blank ? { line: cursor.line, ch: current.length } : at);
    const startLine = cursor.line + (blank ? 0 : 2);
    editor.setCursor({ line: startLine + 3, ch: 0 });
    const el = await this.waitForWidget(view, startLine);
    const ctx = el ? this.contexts.get(el) : undefined;
    if (!el || !ctx) {
      // Obsidian did not draw the empty block: take the placeholder back out and use the pop-up window.
      const block = findBlock(editor.getValue().split('\n'), startLine);
      if (block) editor.replaceRange('', { line: block.start, ch: 0 }, block.end < editor.lastLine() ? { line: block.end + 1, ch: 0 } : { line: block.end, ch: editor.getLine(block.end).length });
      return false;
    }
    this.editInline(el, ctx, true);
    return true;
  }

  private openModalFor(editor: Editor, block: BlockRange, code = false): void {
    new DiagramModal(this.app, block.source, this.settings, (source) => {
      // Re-find the block: the note may have changed while the editor was open.
      const current = findBlock(editor.getValue().split('\n'), Math.min(block.start, editor.lastLine()));
      const target = current ?? block;
      // Replace everything between the fences (works for an empty block too).
      editor.replaceRange(source + '\n', { line: target.start + 1, ch: 0 }, { line: target.end, ch: 0 });
      this.ensureLineAfter(editor, target.start);
    }, code).open();
  }

  /** A note must never end on a diagram's closing fence, or there is nowhere to click to keep writing. */
  private ensureLineAfter(editor: Editor, blockStart: number): void {
    const block = findBlock(editor.getValue().split('\n'), blockStart);
    if (block && block.end === editor.lastLine()) {
      editor.replaceRange('\n', { line: block.end, ch: editor.getLine(block.end).length });
    }
  }

  /**
   * Start a new empty line straight after a rendered diagram and put the
   * cursor on it. From reading view this switches the note to editing view
   * first, since reading view cannot be typed into.
   */
  private async addLineBelow(el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice('Open the note in a tab to add text below the diagram.');
      return;
    }
    // Work out where the diagram is before the view changes and `el` goes away.
    const start = ctx.getSectionInfo(el)?.lineStart ?? this.lineInActiveEditor(el)?.line;
    if (view.getMode() !== 'source') {
      await view.setState({ ...view.getState(), mode: 'source' }, { history: false });
    }
    const editor = view.editor;
    const block = start === undefined ? null : findBlock(editor.getValue().split('\n'), start);
    if (!block) {
      new Notice('This diagram could not be located in the note.');
      return;
    }
    // Reuse an empty line that is already there rather than stacking up blank lines.
    const hasEmptyNext = block.end < editor.lastLine() && editor.getLine(block.end + 1).trim() === '';
    if (!hasEmptyNext) editor.replaceRange('\n', { line: block.end, ch: editor.getLine(block.end).length });
    editor.setCursor({ line: block.end + 1, ch: 0 });
    window.setTimeout(() => editor.focus(), 0);
  }

  private insertNew(editor: Editor): void {
    if (!this.settings.editInPlace) {
      this.insertNewModal(editor);
      return;
    }
    void this.insertNewInline(editor).then((ok) => {
      if (!ok) this.insertNewModal(editor);
    });
  }

  private insertNewModal(editor: Editor): void {
    new DiagramModal(this.app, null, this.settings, (source) => {
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const before = line.trim() === '' ? '' : '\n\n';
      const at = line.trim() === '' ? { line: cursor.line, ch: 0 } : { line: cursor.line, ch: line.length };
      const end = line.trim() === '' ? { line: cursor.line, ch: line.length } : at;
      const text = `${before}${fenced(source)}\n`;
      editor.replaceRange(text, at, end);
      const lines = text.split('\n').length - 1;
      editor.setCursor({ line: at.line + lines, ch: 0 });
      // Put the caret back in the note, on the line after the diagram, ready to type.
      window.setTimeout(() => editor.focus(), 0);
    }).open();
  }

  /** Draws a mermaid block in a note with Pele. */
  private renderBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    el.addClass('volcanic-diagram');
    this.contexts.set(el, ctx);
    const host = el.createDiv({ cls: 'volcanic-diagram-host' });
    const text = stripMeta(source).trim();
    if (!text) {
      host.createEl('p', { cls: 'volcanic-diagram-empty', text: 'Empty diagram.' });
    } else {
      const showError = (error: unknown): void => {
        host.empty();
        const box = host.createDiv({ cls: 'volcanic-diagram-error', attr: { role: 'group', 'aria-label': 'Diagram error' } });
        box.createEl('strong', { text: 'This diagram could not be drawn.' });
        box.createEl('pre', { text: error instanceof Error ? error.message : String(error) });
      };
      try {
        let failure: unknown = null;
        const align = readTitleAlign(source);
        const finish = (): void => {
          if (this.settings.labelsBesideLines) placeEdgeLabels(host);
          alignTitle(host, align);
          setTaskDetails(host, source, this.settings.showTaskDetails);
          setHolidayBands(host, source, { legend: true, storageKey: `volcanic-holidays-off:${ctx.sourcePath}|${readTitle(source)}` });
          setDescription(host, this.settings.showDescription ? readDescription(source) : '', align);
        };
        const fontSize = readFontSize(source) || this.settings.textSize;
        const mounted = mount(host, text, { zoom: false, ...(fontSize ? { fontSize } : {}), onError: (error) => (failure = error), onRender: finish });
        finish();
        ctx.addChild(new PeleBlock(el, mounted));
        failure = failure ?? mounted.error ?? null;
        if (failure) showError(failure);
        else {
          // Pele names the picture from accTitle; fall back to the front matter title.
          const svg = host.querySelector('svg');
          const title = readTitle(text);
          if (svg && title && !svg.hasAttribute('aria-labelledby')) svg.setAttribute('aria-label', title);
        }
      } catch (error) {
        showError(error);
      }
    }
    this.applyTheme(el, source);
    this.applyFit(el);
    this.attachEditButton(el, ctx);
    host.addEventListener('dblclick', () => void this.editRendered(el, ctx));
  }

  /** Let the picture grow and shrink with the note's width (up to a limit, so text never gets huge). */
  private applyFit(el: HTMLElement): void {
    const svg = el.querySelector<SVGSVGElement>('.mermaid > svg, .volcanic-diagram-host > svg, svg.pele');
    if (!this.settings.fitWidth) {
      if (el.hasAttribute('data-volcanic-fit')) el.removeAttribute('data-volcanic-fit');
      return;
    }
    if (!el.hasAttribute('data-volcanic-fit')) el.setAttribute('data-volcanic-fit', '');
    const box = (svg?.getAttribute('viewBox') ?? '').split(/[\s,]+/);
    const width = Number(box[2]);
    const height = Number(box[3]);
    if (!svg) return;
    if (Number.isFinite(width) && width > 0 && svg.style.getPropertyValue('--volcanic-natural') !== String(width)) svg.style.setProperty('--volcanic-natural', String(width));
    if (Number.isFinite(height) && height > 0 && svg.style.getPropertyValue('--volcanic-natural-h') !== String(height)) svg.style.setProperty('--volcanic-natural-h', String(height));
    // A pie or radar chart is round, so growing it with the page makes it huge: keep it close to its drawn size.
    const round = !!svg.querySelector('.pele-slice') || svg.classList.contains('pele-radar');
    if (round !== svg.hasAttribute('data-volcanic-round')) svg.toggleAttribute('data-volcanic-round', round);
  }

  /**
   * Obsidian draws mermaid blocks itself and gives no way to change the text size. When a size is chosen, draw
   * the diagram with Pele instead, in front of Obsidian's picture, which is hidden.
   */
  private useChosenSize(el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string): void {
    const size = readFontSize(source) || this.settings.textSize;
    const natives = Array.from(el.querySelectorAll<HTMLElement>('.mermaid'));
    if (!natives.length) return;
    let host = el.querySelector<HTMLElement>('.volcanic-native-host');
    if (!size) {
      if (host) {
        host.remove();
        for (const native of natives) native.classList.remove('volcanic-hidden');
      }
      return;
    }
    const key = `${size}|${stripMeta(source).trim()}`;
    // Obsidian may draw its picture again later (a new element), so keep every one of them hidden.
    const hideNatives = (): void => natives.forEach((native) => native.classList.add('volcanic-hidden'));
    if (host?.dataset.key === key) {
      hideNatives();
      return;
    }
    host?.remove();
    host = createDiv({ cls: 'volcanic-diagram-host volcanic-native-host' });
    host.dataset.key = key;
    natives[0].before(host);
    hideNatives();
    const text = stripMeta(source).trim();
    if (!text) return;
    try {
      const mounted = mount(host, text, { zoom: false, fontSize: size });
      ctx.addChild(new PeleBlock(el, mounted));
    } catch {
      // If Pele cannot draw it, Obsidian's own picture comes back.
      host.remove();
      for (const native of natives) native.classList.remove('volcanic-hidden');
    }
  }

  /** Colour the diagram with its own theme, or the default one from settings. */
  private applyTheme(el: HTMLElement, source: string): void {
    const theme = readTheme(source) || this.settings.defaultTheme;
    // Obsidian may declare Pele's colour variables on an element inside the block, so mark those too.
    // The picture and the elements around it carry the theme, but never the block itself and never an open
    // editor inside it: an editor with no colours of its own (Default, Obsidian) would otherwise inherit the block's.
    const targets = new Set<Element>(Array.from(el.querySelectorAll<HTMLElement>('.mermaid, .volcanic-diagram-host, .mermaid > svg, .volcanic-diagram-host > svg')));
    // However deep Obsidian nests the picture, mark every element between it and the block.
    for (const svg of Array.from(el.querySelectorAll<SVGSVGElement>('svg.pele'))) {
      for (let node: Element | null = svg; node && node !== el; node = node.parentElement) targets.add(node);
    }
    for (const target of Array.from(targets)) if (target.closest('.volcanic-inline-host')) targets.delete(target);
    const editing = !!el.querySelector('.volcanic-inline-host');
    if (!editing) targets.add(el);
    else if (el.dataset.volcanicTheme !== undefined) delete el.dataset.volcanicTheme;
    for (const target of Array.from(targets) as HTMLElement[]) {
      if (theme) {
        if (target.dataset.volcanicTheme !== theme) target.dataset.volcanicTheme = theme;
      } else if (target.dataset.volcanicTheme !== undefined) delete target.dataset.volcanicTheme;
    }
  }

  /** Adds an "Edit diagram" button to mermaid blocks drawn by Obsidian itself. */
  private addEditButton(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    if (el.classList.contains('volcanic-diagram') || el.querySelector('.volcanic-diagram')) return;
    const code = el.querySelector('pre > code.language-mermaid');
    if (!code && !el.querySelector('.mermaid') && !this.startsMermaidBlock(el, ctx)) return;
    this.contexts.set(el, ctx);
    this.attachEditButton(el, ctx);
    this.finishBuiltIn(el, ctx, code?.textContent?.trim() ? code.textContent : null);
  }

  /** Live Preview draws mermaid blocks without running post-processors, so find them in the page instead. */
  private readonly liveWidgets = new Map<HTMLElement, Component[]>();

  private watchLivePreview(): void {
    const scan = (node: Node): void => {
      if (!(node instanceof HTMLElement)) return;
      const found = node.matches('.cm-lang-mermaid') ? [node] : Array.from(node.querySelectorAll<HTMLElement>('.cm-lang-mermaid'));
      for (const el of found) this.adoptWidget(el, 0);
    };
    const observer = new MutationObserver((records) => {
      let removed = false;
      for (const record of records) {
        record.addedNodes.forEach(scan);
        if (record.removedNodes.length) removed = true;
      }
      if (removed) this.releaseWidgets();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    this.register(() => {
      observer.disconnect();
      this.releaseWidgets(true);
    });
    this.app.workspace.onLayoutReady(() => scan(document.body));
  }

  private adoptWidget(el: HTMLElement, attempt: number): void {
    if (this.liveWidgets.has(el) || el.classList.contains('volcanic-has-edit') || el.querySelector('.volcanic-diagram')) return;
    const view = this.app.workspace
      .getLeavesOfType('markdown')
      .map((leaf) => leaf.view)
      .find((v): v is MarkdownView => v instanceof MarkdownView && v.contentEl.contains(el));
    if (!view) return;
    const children: Component[] = [];
    const ctx = {
      sourcePath: view.file?.path ?? '',
      getSectionInfo: () => null,
      addChild: <T extends Component>(child: T): T => {
        child.load();
        children.push(child);
        return child;
      },
    } as unknown as MarkdownPostProcessorContext;
    this.addEditButton(el, ctx);
    if (el.classList.contains('volcanic-has-edit')) this.liveWidgets.set(el, children);
    else {
      // Obsidian may not have put the diagram inside yet.
      for (const child of children) child.unload();
      if (attempt < 10) window.setTimeout(() => this.adoptWidget(el, attempt + 1), 100);
    }
  }

  private releaseWidgets(all = false): void {
    for (const [el, children] of this.liveWidgets) {
      if (!all && el.isConnected) continue;
      for (const child of children) child.unload();
      this.liveWidgets.delete(el);
    }
  }

  /** True if this section of a note is a mermaid block, whatever Obsidian drew for it. */
  private startsMermaidBlock(el: HTMLElement, ctx: MarkdownPostProcessorContext): boolean {
    const info = ctx.getSectionInfo(el);
    if (!info) return false;
    const lines = info.text.split('\n');
    return findBlock(lines, info.lineStart)?.start === info.lineStart;
  }

  /** The Mermaid source behind a rendered block, however Obsidian drew it. */
  private sourceOf(el: HTMLElement, ctx: MarkdownPostProcessorContext): string | null {
    const info = ctx.getSectionInfo(el);
    if (info) {
      const block = findBlock(info.text.split('\n'), info.lineStart);
      if (block) return block.source;
    }
    const located = this.lineInActiveEditor(el);
    if (!located) return null;
    return findBlock(located.editor.getValue().split('\n'), located.line)?.source ?? null;
  }

  /**
   * Obsidian draws the diagram itself (and a little later), so wait for the
   * picture to appear, then apply the title position and accessible name.
   */
  private finishBuiltIn(el: HTMLElement, ctx: MarkdownPostProcessorContext, known: string | null): void {
    let source = known;
    const apply = (): void => {
      const svg = el.querySelector('svg');
      if (!svg) return;
      // The note's own text is the authority: Obsidian leaves an empty code element in the page.
      const fromNote = this.sourceOf(el, ctx);
      if (fromNote !== null) source = fromNote;
      const saved = this.justSaved.get(el);
      if (saved && Date.now() - saved.at < 5000) source = saved.text;
      if (source === null || source.trim() === '') return;
      if (this.settings.labelsBesideLines) placeEdgeLabels(el);
      alignTitle(el, readTitleAlign(source));
      this.useChosenSize(el, ctx, source);
      this.applyTheme(el, source);
      this.applyFit(el);
      setTaskDetails(el, source, this.settings.showTaskDetails);
      setHolidayBands(el, source, { legend: true, storageKey: `volcanic-holidays-off:${ctx.sourcePath}|${readTitle(source)}` });
      setDescription(el, this.settings.showDescription ? readDescription(source) : '', readTitleAlign(source));
      const title = readTitle(source);
      if (title && !svg.hasAttribute('aria-labelledby') && !svg.hasAttribute('aria-label')) svg.setAttribute('aria-label', title);
    };
    this.redraws.set(el, apply);
    // Only watches for elements being added; our own attribute changes do not re-trigger it.
    const observer = new MutationObserver(apply);
    observer.observe(el, { childList: true, subtree: true });
    const child = new MarkdownRenderChild(el);
    child.register(() => observer.disconnect());
    ctx.addChild(child);
    // The note may not be ready to say where this diagram lives yet, so try again a few times.
    for (const delay of [0, 300, 1000, 2500]) window.setTimeout(apply, delay);
  }

  private attachEditButton(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const tools = el.createDiv({ cls: 'volcanic-block-tools', attr: { role: 'group', 'aria-label': 'Diagram actions' } });
    const addTool = (label: string, icon: string, run: () => void): void => {
      const button = tools.createEl('button', { cls: 'volcanic-edit-button', attr: { type: 'button' } });
      setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
      button.createSpan({ text: label });
      button.addEventListener('mousedown', (event) => event.stopPropagation());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        run();
      });
    };
    addTool('Edit diagram', 'pencil', () => void this.editRendered(el, ctx));
    addTool('Edit source', 'code', () => void this.editRendered(el, ctx, true));
    addTool('Write below', 'corner-down-left', () => void this.addLineBelow(el, ctx));
    el.addClass('volcanic-has-edit');

    // Right-click (or the keyboard's context-menu key) on the diagram itself.
    el.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle('Edit in Volcanic')
          .setIcon('workflow')
          .onClick(() => void this.editRendered(el, ctx)),
      );
      menu.addItem((item) =>
        item
          .setTitle('Edit source in Volcanic')
          .setIcon('code')
          .onClick(() => void this.editRendered(el, ctx, true)),
      );
      menu.addItem((item) =>
        item
          .setTitle('Write below diagram')
          .setIcon('corner-down-left')
          .onClick(() => void this.addLineBelow(el, ctx)),
      );
      if (event.clientX || event.clientY) {
        menu.showAtMouseEvent(event);
      } else {
        // Opened from the keyboard: there is no pointer position to use.
        const rect = el.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left + 16, y: rect.top + 16 });
      }
    });
  }

  /**
   * In live preview a rendered block may not report its lines. Ask the
   * editor where the block's element sits in the document instead.
   */
  private lineInActiveEditor(el: HTMLElement): { editor: Editor; line: number } | null {
    const view = this.app.workspace
      .getLeavesOfType('markdown')
      .map((leaf) => leaf.view)
      .find((v): v is MarkdownView => v instanceof MarkdownView && v.contentEl.contains(el));
    if (!view || view.getMode() !== 'source') return null;
    const cm = (view.editor as unknown as { cm?: { posAtDOM(node: Node): number; state: { doc: { lineAt(pos: number): { number: number } } } } }).cm;
    if (!cm) return null;
    try {
      const line = cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1;
      const lines = view.editor.getValue().split('\n');
      // The reported position can be the fence itself or the line just before it.
      for (const candidate of [line, line + 1]) {
        if (findBlock(lines, candidate)) return { editor: view.editor, line: candidate };
      }
    } catch {
      // The element is not part of the editor's document.
    }
    return null;
  }

  /** Find the diagram's block in its note, whether the note is being edited or only read. */
  private handleFor(el: HTMLElement, ctx: MarkdownPostProcessorContext): BlockHandle | null {
    const located = this.lineInActiveEditor(el);
    if (located) {
      const { editor } = located;
      const first = findBlock(editor.getValue().split('\n'), located.line);
      if (!first) return null;
      const current = (): BlockRange => findBlock(editor.getValue().split('\n'), Math.min(first.start, editor.lastLine())) ?? first;
      return {
        source: first.source,
        write: (source) => {
          const block = current();
          editor.replaceRange(source + '\n', { line: block.start + 1, ch: 0 }, { line: block.end, ch: 0 });
          this.ensureLineAfter(editor, block.start);
        },
        remove: () => {
          const block = current();
          const to = block.end < editor.lastLine() ? { line: block.end + 1, ch: 0 } : { line: block.end, ch: editor.getLine(block.end).length };
          editor.replaceRange('', { line: block.start, ch: 0 }, to);
        },
      };
    }
    const info = ctx.getSectionInfo(el);
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!info || !(file instanceof TFile)) return null;
    const first = findBlock(info.text.split('\n'), info.lineStart);
    if (!first || first.start !== info.lineStart) return null;
    const change = (apply: (lines: string[], block: BlockRange) => void): void => {
      void this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        const block = findBlock(lines, first.start);
        if (!block || block.source !== first.source) {
          new Notice('The note changed while you were editing, so the diagram was not updated.');
          return data;
        }
        apply(lines, block);
        return lines.join('\n');
      });
    };
    return {
      source: first.source,
      write: (source) =>
        change((lines, block) => {
          lines.splice(block.start + 1, block.end - block.start - 1, ...source.split('\n'));
          // If the diagram is the last thing in the note, leave a line to write on.
          if (findBlock(lines, block.start)?.end === lines.length - 1) lines.push('');
        }),
      remove: () => change((lines, block) => void lines.splice(block.start, block.end - block.start + 1)),
    };
  }

  /** Replace the drawn diagram with the editor, right where it sits in the note. */
  private editInline(el: HTMLElement, ctx: MarkdownPostProcessorContext, isNew = false, code = false): void {
    if (el.querySelector('.volcanic-inline-host')) return;
    const handle = this.handleFor(el, ctx);
    if (!handle) {
      new Notice('This diagram could not be located in the note.');
      return;
    }
    const covered = Array.from(el.children) as HTMLElement[];
    for (const child of covered) child.addClass('volcanic-hidden');
    const host = el.createDiv({ cls: 'volcanic-inline-host' });
    // Keep the note's own editor from treating clicks and keystrokes inside the editor as its own.
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'paste', 'copy', 'cut', 'contextmenu', 'input', 'beforeinput']) {
      host.addEventListener(type, (event) => event.stopPropagation());
    }
    // A bar under the editor to make it taller or shorter. Large displays can use the room.
    const grip = resizeHandle(host, { min: 480, max: () => Math.max(600, window.innerHeight * 3), storageKey: 'volcanic-inline-height' });
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'pointerdown']) {
      grip.addEventListener(type, (event) => event.stopPropagation());
    }
    host.after(grip);
    let finished = false;
    const close = (): void => {
      if (finished) return;
      finished = true;
      editor.destroy();
      grip.remove();
      host.remove();
      for (const child of covered) child.removeClass('volcanic-hidden');
    };
    const leave = (): void => {
      close();
      if (isNew) handle.remove();
    };
    const editor: DiagramEditor = new DiagramEditor(
      host,
      {
        setIcon,
        inline: true,
        startInCode: code,
        submitLabel: isNew ? 'Insert diagram' : 'Update diagram',
        labelsBesideLines: this.settings.labelsBesideLines,
        defaultTheme: this.settings.defaultTheme,
        defaultFontSize: this.settings.textSize,
        onSubmit: (source) => {
          close();
          handle.write(source);
          // Draw with the text just saved, now and again shortly, in case Obsidian redraws before the note updates.
          this.justSaved.set(el, { text: source, at: Date.now() });
          const redraw = (): void => this.redraws.get(el)?.();
          redraw();
          window.setTimeout(redraw, 250);
          window.setTimeout(redraw, 900);
        },
        onCancel: () => {
          if (!editor.isDirty()) leave();
          else new ConfirmModal(this.app, 'Discard changes?', 'Your changes to this diagram have not been inserted into the note.', 'Discard', leave).open();
        },
      },
      isNew ? null : handle.source,
    );
    const child = new MarkdownRenderChild(el);
    child.onunload = close;
    ctx.addChild(child);
    window.setTimeout(() => {
      host.scrollIntoView({ block: 'nearest' });
      editor.focus();
    }, 0);
  }

  private async editRendered(el: HTMLElement, ctx: MarkdownPostProcessorContext, code = false): Promise<void> {
    if (this.settings.editInPlace) {
      this.editInline(el, ctx, false, code);
      return;
    }
    const info = ctx.getSectionInfo(el);
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!info || !(file instanceof TFile)) {
      const located = this.lineInActiveEditor(el);
      if (located) {
        this.openForEditor(located.editor, located.line, code);
        return;
      }
      new Notice('Place the cursor inside the diagram in editing view, then run “Create or edit diagram at cursor”.');
      return;
    }
    const block = findBlock(info.text.split('\n'), info.lineStart);
    if (!block || block.start !== info.lineStart) {
      new Notice('This diagram could not be located in the note.');
      return;
    }
    new DiagramModal(this.app, block.source, this.settings, (source) => {
      void this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        const current = findBlock(lines, block.start);
        if (!current || current.source !== block.source) {
          new Notice('The note changed while you were editing, so the diagram was not updated.');
          return data;
        }
        lines.splice(current.start + 1, current.end - current.start - 1, ...source.split('\n'));
        const result = lines.join('\n');
        // If the diagram is the last thing in the note, leave a line to write on.
        return findBlock(lines, current.start)?.end === lines.length - 1 ? result + '\n' : result;
      });
    }, code).open();
  }
}

class VolcanicSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: VolcanicPlugin) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    // Newer Obsidian draws settings in groups, and themes style the group as one card.
    // Loose settings next to a group look broken, so use a group when this version has one.
    const Group = (obsidianModule as { SettingGroup?: new (el: HTMLElement) => SettingGroup }).SettingGroup;
    const group = Group ? new Group(this.containerEl) : null;
    const add = (build: (setting: Setting) => void): void => {
      if (group) group.addSetting(build);
      else build(new Setting(this.containerEl));
    };
    const toggle = (name: string, desc: string, key: { [K in keyof VolcanicSettings]: VolcanicSettings[K] extends boolean ? K : never }[keyof VolcanicSettings]): void =>
      add((setting) =>
        setting
          .setName(name)
          .setDesc(desc)
          .addToggle((control) =>
            control.setValue(this.plugin.settings[key]).onChange(async (value) => {
              this.plugin.settings[key] = value;
              await this.plugin.saveData(this.plugin.settings);
            }),
          ),
      );
    add((setting) =>
      setting
        .setName('Default colour theme')
        .setDesc('The colours for diagrams that have not chosen a theme of their own. You can pick a different theme for any diagram in its editor. Reopen a note to see the change.')
        .addDropdown((dropdown) => {
          dropdown.addOption(DEFAULT_THEME_ID, 'Match Obsidian');
          for (const theme of THEMES) if (theme.light) dropdown.addOption(theme.id, theme.name);
          dropdown.setValue(this.plugin.settings.defaultTheme).onChange(async (value) => {
            this.plugin.settings.defaultTheme = value;
            await this.plugin.saveData(this.plugin.settings);
          });
        }),
    );
    toggle('Draw diagrams in notes with Pele', 'Uses the bundled Pele renderer for every mermaid block, so notes match the editor preview. Turn off to use Obsidian\u2019s own renderer. Takes effect after reloading Obsidian or re-enabling the plugin.', 'renderInNotes');
    toggle('Edit diagrams inside the note', 'Opens the editor in place of the diagram, in Live Preview and Reading view, instead of in a pop-up window. Source mode and some situations still use the pop-up window.', 'editInPlace');
    add((setting) =>
      setting
        .setName('Diagram text size')
        .setDesc('The text size for diagrams that have not chosen one of their own. Pele\u2019s own size is 16. You can pick a different size for any diagram in its editor. Reopen a note to see the change.')
        .addDropdown((dropdown) => {
          for (const size of TEXT_SIZES) dropdown.addOption(size.id, size.id ? size.name : 'Default (16)');
          dropdown.setValue(this.plugin.settings.textSize ? String(this.plugin.settings.textSize) : '').onChange(async (value) => {
            this.plugin.settings.textSize = Number(value) || 0;
            await this.plugin.saveData(this.plugin.settings);
          });
        }),
    );
    toggle('Fit diagrams to the note width', 'Scales each diagram up or down to match the width of the note or pane, so it reads well on wide screens and in narrow side panes. Turn off to keep every diagram at its drawn size. Reopen a note to see the change.', 'fitWidth');
    toggle('Show assignee, status and progress on Gantt tasks', 'Draws who a task is assigned to, its status and its percent complete beside each bar, and fills the bar to show progress. Reopen a note to see the change.', 'showTaskDetails');
    toggle('Show descriptions under diagrams', 'Shows the description you give a diagram as a caption below it. Screen readers read the description either way. Reopen a note to see the change.', 'showDescription');
    toggle('Put connection labels beside their lines', 'Moves the text on a connection off the line: above or below a line that runs across, left or right of one that runs up and down. Turn off to keep labels on the line. Reopen a note to see the change.', 'labelsBesideLines');
  }
}
