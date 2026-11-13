import { h, uniqueId } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import { BITS_PER_ROW, MAX_BITS, nextFieldId, packetToMermaid, placeFields, rangeText, starterPacket, totalBits, type Packet, type PacketField } from './packet';
import { iconButton } from './ui';

/**
 * A packet diagram as a list of fields, one after another from bit 0. Give each field a name and a width in bits;
 * the bits it covers work themselves out, and move along when you reorder, add or remove fields.
 */
export class PacketEditor implements KindEditor {
  readonly el: HTMLElement;
  private p: Packet;
  private readonly history: History<Packet>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-pk');

  private list!: HTMLElement;
  private summary!: HTMLElement;

  constructor(private readonly host: KindHost, packet: Packet, pristine = false) {
    this.p = JSON.parse(JSON.stringify(packet)) as Packet;
    this.history = new History(this.p);
    this.initial = pristine ? JSON.stringify(this.p) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return packetToMermaid(this.p, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.p) === this.initial;
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

  private apply(value: Packet | null, message: string): void {
    if (!value) return;
    this.p = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Packet diagram tools' } },
      iconButton(this.host.setIcon, 'Add field', 'plus', () => this.addField(8)),
      iconButton(this.host.setIcon, 'Add 1-bit flag', 'plus', () => this.addField(1)),
    );
    this.list = h('div', { class: 'volcanic-pk-list', attrs: { role: 'group', 'aria-label': 'Fields', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Each row is a field. Type its name and its width in bits; the bits it covers follow on from the field above. Hold Alt with the up and down arrow keys in a row to move it, or use its Move buttons.',
    });
    const canvas = h('div', { class: 'volcanic-kind-canvas' }, h('div', { class: 'volcanic-pk-scroll' }, this.list, help));
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this packet' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'Packet' }), this.summary, h('p', { class: 'volcanic-hint', text: `Fields run one after another from bit 0, and the diagram draws ${BITS_PER_ROW} bits to a row. A field wider than a row carries on to the next.` })),
    );
    return h('div', { class: 'volcanic-kind volcanic-pk' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the packet ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.p, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview and ranges, but leave the rows alone. */
  private update(tag: string): void {
    this.history.push(this.p, tag);
    this.host.changed();
    this.renderRanges();
    this.renderNotes();
  }

  private name(f: PacketField): string {
    return f.label.replace(/\s+/g, ' ').trim() || 'Untitled field';
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.list.querySelector<HTMLInputElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select) el.select();
    return true;
  }

  private addField(bits: number): void {
    const field: PacketField = { id: nextFieldId(this.p), label: bits === 1 ? 'Flag' : 'New field', bits };
    this.p.fields.push(field);
    this.commit();
    this.host.announce(`${bits === 1 ? 'Flag' : 'Field'} added. Type its name.`);
    this.focusKey(`label:${field.id}`, true);
  }

  private removeField(id: string): void {
    const at = this.p.fields.findIndex((f) => f.id === id);
    if (at < 0) return;
    const [gone] = this.p.fields.splice(at, 1);
    this.commit();
    this.host.announce(`${this.name(gone)} removed.`);
    const near = this.p.fields[Math.min(at, this.p.fields.length - 1)];
    if (!near || !this.focusKey(`label:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  private moveField(id: string, by: -1 | 1, key?: string): boolean {
    const from = this.p.fields.findIndex((f) => f.id === id);
    const to = from + by;
    if (from < 0) return false;
    if (to < 0 || to >= this.p.fields.length) {
      this.host.announce(by < 0 ? 'Already the first field.' : 'Already the last field.');
      return false;
    }
    const [field] = this.p.fields.splice(from, 1);
    this.p.fields.splice(to, 0, field);
    this.commit();
    const placed = placeFields(this.p)[to];
    this.host.announce(`${this.name(field)} moved to position ${to + 1} of ${this.p.fields.length}, bits ${rangeText(placed.start, placed.end)}.`);
    if (key) this.focusKey(key);
    return true;
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active?.instanceOf(HTMLElement) && this.list.contains(active);
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
    const placed = placeFields(this.p);
    const head = h('div', { class: 'volcanic-pk-row volcanic-pk-head', attrs: { 'aria-hidden': 'true' } }, h('span'), h('span', { text: 'Field' }), h('span', { text: 'Bits' }), h('span', { text: 'Covers bits' }), h('span'));
    const rows = placed.map(({ field, start, end }, index) => {
      const label = h('input', { class: 'volcanic-input', attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Name of field ${index + 1}`, 'data-key': `label:${field.id}` } });
      label.value = field.label;
      label.addEventListener('input', () => {
        field.label = label.value;
        this.update(`label:${field.id}`);
      });
      const bits = h('input', {
        class: 'volcanic-input volcanic-radar-value',
        attrs: { type: 'number', min: '1', max: String(MAX_BITS), step: '1', inputmode: 'numeric', 'aria-label': `Width of ${this.name(field)} in bits`, 'data-key': `bits:${field.id}` },
      });
      bits.value = String(field.bits);
      bits.addEventListener('input', () => {
        const n = Math.round(Number(bits.value));
        if (bits.value === '' || !Number.isFinite(n) || n < 1 || n > MAX_BITS) return;
        field.bits = n;
        this.update(`bits:${field.id}`);
      });
      bits.addEventListener('blur', () => (bits.value = String(field.bits)));
      const range = h('span', { class: 'volcanic-pk-range', attrs: { 'data-range': field.id }, text: rangeText(start, end) });
      const row = h(
        'div',
        { class: 'volcanic-pk-row' },
        h(
          'span',
          { class: 'volcanic-radar-move' },
          this.small(`Move ${this.name(field)} up`, 'arrow-up', `up:${field.id}`, () => this.moveField(field.id, -1), index === 0),
          this.small(`Move ${this.name(field)} down`, 'arrow-down', `down:${field.id}`, () => this.moveField(field.id, 1), index === placed.length - 1),
        ),
        label,
        bits,
        range,
        this.small(`Remove ${this.name(field)}`, 'x', `rm:${field.id}`, () => this.removeField(field.id)),
      );
      row.addEventListener('keydown', (event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        this.moveField(field.id, event.key === 'ArrowUp' ? -1 : 1, (event.target as HTMLElement).dataset.key);
      });
      return row;
    });
    this.list.replaceChildren(head, ...rows);
    if (!rows.length) this.list.append(h('p', { class: 'volcanic-hint', text: 'No fields yet. Add one with the Add field button.' }));
  }

  /** Each field's bits change whenever a field before it does. */
  private renderRanges(): void {
    for (const { field, start, end } of placeFields(this.p)) {
      const cell = this.list.querySelector<HTMLElement>(`[data-range="${field.id}"]`);
      if (cell) cell.textContent = rangeText(start, end);
    }
  }

  private renderNotes(): void {
    const total = totalBits(this.p);
    const n = this.p.fields.length;
    const rows = Math.ceil(total / BITS_PER_ROW);
    this.summary.textContent = `${n} ${n === 1 ? 'field' : 'fields'}, ${total} ${total === 1 ? 'bit' : 'bits'}${total % 8 === 0 && total ? ` (${total / 8} ${total === 8 ? 'byte' : 'bytes'})` : ''}, ${rows} ${rows === 1 ? 'row' : 'rows'} of ${BITS_PER_ROW}.`;
  }
}

export { starterPacket };
