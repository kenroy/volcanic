import { h, uniqueId } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { formatAmount, loopsIn, nameOf, nextFlowId, nodesOf, sankeyToMermaid, starterSankey, totalsOf, type Sankey, type SankeyFlow } from './sankey';
import { iconButton } from './ui';

/**
 * A Sankey diagram as a list of flows: where it comes from, where it goes and how much. Names you have already used
 * are offered as you type, so a flow joins the one before it. The side panel shows what goes into and out of each place.
 */
export class SankeyEditor implements KindEditor {
  readonly el: HTMLElement;
  private s: Sankey;
  private readonly history: History<Sankey>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-sankey');

  private list!: HTMLElement;
  private names!: HTMLDataListElement;
  private totals!: HTMLElement;
  private warning!: HTMLElement;
  private summary!: HTMLElement;

  constructor(private readonly host: KindHost, sankey: Sankey, pristine = false) {
    this.s = JSON.parse(JSON.stringify(sankey)) as Sankey;
    this.history = new History(this.s);
    this.initial = pristine ? JSON.stringify(this.s) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return sankeyToMermaid(this.s, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.s) === this.initial;
  }

  focus(): void {
    this.list.querySelector<HTMLElement>('input')?.focus();
  }

  undo(): void {
    this.apply(this.history.undo(), 'Undone.');
  }

  redo(): void {
    this.apply(this.history.redo(), 'Redone.');
  }

  canUndo(): boolean {
    return this.history.canUndo;
  }

  canRedo(): boolean {
    return this.history.canRedo;
  }

  destroy(): void {
    this.el.remove();
  }

  private apply(value: Sankey | null, message: string): void {
    if (!value) return;
    this.s = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Sankey diagram tools' } },
      iconButton(this.host.setIcon, 'Add flow', 'plus', () => this.addFlow()),
    );
    this.names = h('datalist', { attrs: { id: `${this.uid}-names` } });
    this.list = h('div', { class: 'volcanic-sankey-list', attrs: { role: 'group', 'aria-label': 'Flows', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Each row is a flow: where it comes from, where it goes, and how much. Names you have used before are offered as you type. Hold Alt with the up and down arrow keys in a row to move it, or use its Move buttons.',
    });
    const canvas = h('div', { class: 'volcanic-kind-canvas' }, h('div', { class: 'volcanic-sankey-scroll' }, this.list, this.names, help));
    this.warning = h('p', { class: 'volcanic-radar-warning', attrs: { role: 'status' } });
    this.totals = h('table', { class: 'volcanic-sankey-totals' });
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this diagram' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'Places' }), this.totals, this.warning, this.summary),
    );
    return h('div', { class: 'volcanic-kind volcanic-sankey' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the diagram ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.s, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview and totals, but leave the rows alone. */
  private update(tag: string): void {
    this.history.push(this.s, tag);
    this.host.changed();
    this.renderNotes();
  }

  private describe(f: SankeyFlow): string {
    return `${nameOf(f.source) || 'nowhere'} to ${nameOf(f.target) || 'nowhere'}`;
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.list.querySelector<HTMLInputElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select) el.select();
    return true;
  }

  private addFlow(): void {
    const last = this.s.flows[this.s.flows.length - 1];
    const flow: SankeyFlow = { id: nextFlowId(this.s), source: last ? nameOf(last.target) : '', target: '', value: last ? last.value : 10 };
    this.s.flows.push(flow);
    this.commit();
    this.host.announce('Flow added. Type where it goes.');
    this.focusKey(flow.source ? `to:${flow.id}` : `from:${flow.id}`, true);
  }

  private removeFlow(id: string): void {
    const at = this.s.flows.findIndex((f) => f.id === id);
    if (at < 0) return;
    const [gone] = this.s.flows.splice(at, 1);
    this.commit();
    this.host.announce(`Flow ${this.describe(gone)} removed.`);
    const near = this.s.flows[Math.min(at, this.s.flows.length - 1)];
    if (!near || !this.focusKey(`from:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  private moveFlow(id: string, by: -1 | 1, key?: string): boolean {
    const from = this.s.flows.findIndex((f) => f.id === id);
    const to = from + by;
    if (from < 0) return false;
    if (to < 0 || to >= this.s.flows.length) {
      this.host.announce(by < 0 ? 'Already the first flow.' : 'Already the last flow.');
      return false;
    }
    const [flow] = this.s.flows.splice(from, 1);
    this.s.flows.splice(to, 0, flow);
    this.commit();
    this.host.announce(`Flow ${this.describe(flow)} moved to position ${to + 1} of ${this.s.flows.length}.`);
    if (key) this.focusKey(key);
    return true;
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && this.list.contains(active);
    const keep = inside ? active.dataset.key : undefined;
    const keepAct = inside && !keep ? active.dataset.act : undefined;
    this.renderList();
    this.renderNotes();
    if (keep) this.focusKey(keep);
    else if (keepAct) this.list.querySelector<HTMLElement>(`[data-act="${keepAct}"]`)?.focus();
  }

  private small(label: string, icon: string, act: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = iconButton(this.host.setIcon, label, icon, onClick, 'volcanic-radar-small');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.act = act;
    if (disabled) button.setAttribute('aria-disabled', 'true');
    return button;
  }

  private renderList(): void {
    const { flows } = this.s;
    const head = h('div', { class: 'volcanic-sankey-row volcanic-sankey-head', attrs: { 'aria-hidden': 'true' } }, h('span'), h('span', { text: 'From' }), h('span', { text: 'To' }), h('span', { text: 'Amount' }), h('span'));
    const rows = flows.map((flow, index) => {
      const text = (key: 'source' | 'target', prefix: string, label: string): HTMLInputElement => {
        const input = h('input', {
          class: 'volcanic-input',
          attrs: { type: 'text', autocomplete: 'off', list: `${this.uid}-names`, 'aria-label': `${label} of flow ${index + 1}`, 'data-key': `${prefix}:${flow.id}` },
        });
        input.value = flow[key];
        input.addEventListener('input', () => {
          flow[key] = input.value;
          this.update(`${prefix}:${flow.id}`);
        });
        return input;
      };
      const amount = h('input', {
        class: 'volcanic-input volcanic-radar-value',
        attrs: { type: 'number', min: '0', step: 'any', inputmode: 'decimal', 'aria-label': `Amount of flow ${index + 1}`, 'data-key': `value:${flow.id}` },
      });
      amount.value = formatAmount(flow.value);
      amount.addEventListener('input', () => {
        const n = Number(amount.value);
        if (amount.value === '' || !Number.isFinite(n) || n < 0) return;
        flow.value = n;
        this.update(`value:${flow.id}`);
      });
      amount.addEventListener('blur', () => (amount.value = formatAmount(flow.value)));
      const row = h(
        'div',
        { class: 'volcanic-sankey-row' },
        h(
          'span',
          { class: 'volcanic-radar-move' },
          this.small(`Move flow ${index + 1} up`, 'arrow-up', `up:${flow.id}`, () => this.moveFlow(flow.id, -1), index === 0),
          this.small(`Move flow ${index + 1} down`, 'arrow-down', `down:${flow.id}`, () => this.moveFlow(flow.id, 1), index === flows.length - 1),
        ),
        text('source', 'from', 'Source'),
        text('target', 'to', 'Target'),
        amount,
        this.small(`Remove flow ${index + 1}`, 'x', `rm:${flow.id}`, () => this.removeFlow(flow.id)),
      );
      row.addEventListener('keydown', (event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        this.moveFlow(flow.id, event.key === 'ArrowUp' ? -1 : 1, (event.target as HTMLElement).dataset.key);
      });
      return row;
    });
    this.list.replaceChildren(head, ...rows);
    if (!rows.length) this.list.append(h('p', { class: 'volcanic-hint', text: 'No flows yet. Add one with the Add flow button.' }));
  }

  private renderNotes(): void {
    const nodes = nodesOf(this.s);
    this.names.replaceChildren(...nodes.map((n) => h('option', { attrs: { value: n } })));
    const rows = totalsOf(this.s);
    this.totals.replaceChildren(
      h('thead', {}, h('tr', {}, h('th', { text: 'Place', attrs: { scope: 'col' } }), h('th', { text: 'In', attrs: { scope: 'col' } }), h('th', { text: 'Out', attrs: { scope: 'col' } }))),
      h(
        'tbody',
        {},
        ...rows.map((r) => h('tr', {}, h('th', { text: r.name, attrs: { scope: 'row' } }), h('td', { text: r.into ? formatAmount(r.into) : '–' }), h('td', { text: r.out ? formatAmount(r.out) : '–' }))),
      ),
    );
    const loops = loopsIn(this.s);
    const incomplete = this.s.flows.filter((f) => !nameOf(f.source) || !nameOf(f.target)).length;
    const messages: string[] = [];
    if (loops.length) messages.push(`⚠ ${loops.join(', ')} flows back into itself. A Sankey diagram cannot draw a loop; remove the flow that closes it.`);
    if (incomplete) messages.push(`${incomplete} ${incomplete === 1 ? 'flow is' : 'flows are'} missing a name and will be left out.`);
    this.warning.hidden = !messages.length;
    this.warning.textContent = messages.join(' ');
    const flows = this.s.flows.length;
    this.summary.textContent = `${nodes.length} ${nodes.length === 1 ? 'place' : 'places'}, ${flows} ${flows === 1 ? 'flow' : 'flows'}.`;
  }
}

export { starterSankey };
