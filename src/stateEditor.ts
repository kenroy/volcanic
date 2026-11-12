import { h, uniqueId } from './dom';
import { History, type KindEditor, type KindHost, type KindMeta } from './kinds';
import {
  DIRECTIONS,
  END,
  START,
  duplicateNames,
  loose,
  stateName as nameOf,
  nextStateId,
  nextTransitionId,
  starterState,
  stateToMermaid,
  usesOf,
  type StateBox,
  type StateDiagram,
  type Transition,
} from './state';
import { field, iconButton, selectControl } from './ui';

/**
 * A state diagram as two lists: the states, and the transitions between them. Each transition is picked from the
 * states you have named, plus the start and end dots. Removing a state takes its transitions with it.
 */
export class StateEditor implements KindEditor {
  readonly el: HTMLElement;
  private d: StateDiagram;
  private readonly history: History<StateDiagram>;
  private readonly initial: string;
  private readonly uid = uniqueId('volcanic-st');

  private stateList!: HTMLElement;
  private transList!: HTMLElement;
  private options!: HTMLElement;
  private warning!: HTMLElement;
  private summary!: HTMLElement;
  private counts = new Map<string, HTMLElement>();

  constructor(private readonly host: KindHost, diagram: StateDiagram, pristine = false) {
    this.d = JSON.parse(JSON.stringify(diagram)) as StateDiagram;
    this.history = new History(this.d);
    this.initial = pristine ? JSON.stringify(this.d) : '';
    this.el = this.build();
    this.renderAll();
  }

  // ───────────────────────────── KindEditor ─────────────────────────────

  source(meta: KindMeta): string {
    return stateToMermaid(this.d, meta);
  }

  isPristine(): boolean {
    return this.initial !== '' && JSON.stringify(this.d) === this.initial;
  }

  focus(): void {
    this.stateList.querySelector<HTMLElement>('input')?.focus();
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

  private apply(value: StateDiagram | null, message: string): void {
    if (!value) return;
    this.d = value;
    this.renderAll();
    this.host.changed();
    this.host.announce(message);
  }

  // ───────────────────────────── Build ─────────────────────────────

  private build(): HTMLElement {
    const helpId = `${this.uid}-help`;
    const toolbar = h(
      'div',
      { class: 'volcanic-kind-toolbar', attrs: { role: 'toolbar', 'aria-label': 'State diagram tools' } },
      iconButton(this.host.setIcon, 'Add state', 'plus', () => this.addState()),
      iconButton(this.host.setIcon, 'Add transition', 'arrow-right', () => this.addTransition()),
    );
    this.stateList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'States', 'aria-describedby': helpId } });
    this.transList = h('div', { class: 'volcanic-st-list', attrs: { role: 'group', 'aria-label': 'Transitions', 'aria-describedby': helpId } });
    const help = h('p', {
      class: 'volcanic-sr-only',
      attrs: { id: helpId },
      text: 'Name your states in the first list, then join them with transitions in the second. A transition can start from the start dot and finish at the end dot. Hold Alt with the up and down arrow keys in a row to move it, or use its Move buttons.',
    });
    const canvas = h(
      'div',
      { class: 'volcanic-kind-canvas' },
      h(
        'div',
        { class: 'volcanic-st-scroll' },
        h('h3', { class: 'volcanic-panel-title', text: 'States' }),
        this.stateList,
        h('h3', { class: 'volcanic-panel-title', text: 'Transitions' }),
        this.transList,
        help,
      ),
    );
    this.options = h('div', { class: 'volcanic-st-options' });
    this.warning = h('p', { class: 'volcanic-radar-warning', attrs: { role: 'status' } });
    this.summary = h('p', { class: 'volcanic-hint' });
    const side = h(
      'section',
      { class: 'volcanic-card volcanic-kind-side', attrs: { 'aria-label': 'About this diagram' } },
      h('div', { class: 'volcanic-panel' }, h('h3', { class: 'volcanic-panel-title', text: 'Layout' }), this.options, this.warning, this.summary),
    );
    return h('div', { class: 'volcanic-kind volcanic-st' }, toolbar, h('div', { class: 'volcanic-kind-main' }, canvas, side));
  }

  // ───────────────────────────── Changing the diagram ─────────────────────────────

  private commit(tag = ''): void {
    this.history.push(this.d, tag);
    this.host.changed();
    this.renderAll();
  }

  /** Typing: record it and refresh the preview, pickers and notes, but leave the row being typed in alone. */
  private update(tag: string): void {
    this.history.push(this.d, tag);
    this.host.changed();
    this.renderTransitions();
    this.renderNotes();
  }

  private label(id: string): string {
    if (id === START) return 'the start';
    if (id === END) return 'the end';
    const s = this.d.states.find((x) => x.id === id);
    return (s && nameOf(s.name)) || 'an unnamed state';
  }

  private describe(t: Transition): string {
    return `${this.label(t.from)} to ${this.label(t.to)}`;
  }

  private focusKey(key: string, select = false): boolean {
    const el = this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-key="${key}"]`);
    if (!el) return false;
    el.focus();
    if (select && el instanceof HTMLInputElement) el.select();
    return true;
  }

  private addState(): void {
    const state: StateBox = { id: nextStateId(this.d), name: '' };
    this.d.states.push(state);
    this.commit();
    this.host.announce('State added. Type its name.');
    this.focusKey(`name:${state.id}`);
  }

  private removeState(id: string): void {
    const at = this.d.states.findIndex((s) => s.id === id);
    if (at < 0) return;
    const name = this.label(id);
    const before = this.d.transitions.length;
    this.d.states.splice(at, 1);
    this.d.transitions = this.d.transitions.filter((t) => t.from !== id && t.to !== id);
    const dropped = before - this.d.transitions.length;
    this.commit();
    this.host.announce(`State ${name} removed${dropped ? `, with ${dropped} ${dropped === 1 ? 'transition' : 'transitions'}` : ''}.`);
    const near = this.d.states[Math.min(at, this.d.states.length - 1)];
    if (!near || !this.focusKey(`name:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  private moveState(id: string, by: -1 | 1, key?: string): boolean {
    const from = this.d.states.findIndex((s) => s.id === id);
    const to = from + by;
    if (from < 0) return false;
    if (to < 0 || to >= this.d.states.length) {
      this.host.announce(by < 0 ? 'Already the first state.' : 'Already the last state.');
      return false;
    }
    const [state] = this.d.states.splice(from, 1);
    this.d.states.splice(to, 0, state);
    this.commit();
    this.host.announce(`State ${this.label(id)} moved to position ${to + 1} of ${this.d.states.length}.`);
    if (key) this.focusKey(key);
    return true;
  }

  private addTransition(): void {
    const { states, transitions } = this.d;
    if (!states.length) {
      this.host.announce('Add a state first.');
      return;
    }
    const last = transitions[transitions.length - 1];
    const from = !last ? START : last.to === END ? states[0].id : last.to;
    const next = states.find((s) => s.id !== from);
    const t: Transition = { id: nextTransitionId(this.d), from, to: next ? next.id : END, label: '' };
    transitions.push(t);
    this.commit();
    this.host.announce(`Transition added, ${this.describe(t)}. Choose where it starts and ends.`);
    this.focusKey(`from:${t.id}`);
  }

  private removeTransition(id: string): void {
    const at = this.d.transitions.findIndex((t) => t.id === id);
    if (at < 0) return;
    const [gone] = this.d.transitions.splice(at, 1);
    this.commit();
    this.host.announce(`Transition ${this.describe(gone)} removed.`);
    const near = this.d.transitions[Math.min(at, this.d.transitions.length - 1)];
    if (!near || !this.focusKey(`from:${near.id}`)) this.el.querySelector<HTMLElement>('button')?.focus();
  }

  private moveTransition(id: string, by: -1 | 1, key?: string): boolean {
    const from = this.d.transitions.findIndex((t) => t.id === id);
    const to = from + by;
    if (from < 0) return false;
    if (to < 0 || to >= this.d.transitions.length) {
      this.host.announce(by < 0 ? 'Already the first transition.' : 'Already the last transition.');
      return false;
    }
    const [t] = this.d.transitions.splice(from, 1);
    this.d.transitions.splice(to, 0, t);
    this.commit();
    this.host.announce(`Transition ${this.describe(t)} moved to position ${to + 1} of ${this.d.transitions.length}.`);
    if (key) this.focusKey(key);
    return true;
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private renderAll(): void {
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && this.el.contains(active);
    const keep = inside ? active.dataset.key : undefined;
    const keepAct = inside && !keep ? active.dataset.act : undefined;
    this.renderStates();
    this.renderTransitions();
    this.renderOptions();
    this.renderNotes();
    if (keep) this.focusKey(keep);
    else if (keepAct) this.el.querySelector<HTMLElement>(`[data-act="${keepAct}"]`)?.focus();
  }

  private small(label: string, icon: string, act: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = iconButton(this.host.setIcon, label, icon, onClick, 'volcanic-radar-small');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.act = act;
    if (disabled) button.setAttribute('aria-disabled', 'true');
    return button;
  }

  private moveButtons(kind: string, id: string, index: number, count: number, move: (by: -1 | 1) => void): HTMLElement {
    return h(
      'span',
      { class: 'volcanic-radar-move' },
      this.small(`Move ${kind} ${index + 1} up`, 'arrow-up', `up:${id}`, () => move(-1), index === 0),
      this.small(`Move ${kind} ${index + 1} down`, 'arrow-down', `down:${id}`, () => move(1), index === count - 1),
    );
  }

  private renderStates(): void {
    const { states } = this.d;
    this.counts = new Map();
    const rows = states.map((state, index) => {
      const input = h('input', {
        class: 'volcanic-input',
        attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Name of state ${index + 1}`, 'data-key': `name:${state.id}`, placeholder: 'State name' },
      });
      input.value = state.name;
      input.addEventListener('input', () => {
        state.name = input.value;
        this.update(`name:${state.id}`);
      });
      const count = h('span', { class: 'volcanic-hint volcanic-st-count' });
      this.counts.set(state.id, count);
      const row = h(
        'div',
        { class: 'volcanic-st-row volcanic-st-state' },
        this.moveButtons('state', state.id, index, states.length, (by) => this.moveState(state.id, by)),
        input,
        count,
        this.small(`Remove state ${index + 1}`, 'x', `rm:${state.id}`, () => this.removeState(state.id)),
      );
      row.addEventListener('keydown', (event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        this.moveState(state.id, event.key === 'ArrowUp' ? -1 : 1, (event.target as HTMLElement).dataset.key);
      });
      return row;
    });
    this.stateList.replaceChildren(...rows);
    if (!rows.length) this.stateList.append(h('p', { class: 'volcanic-hint', text: 'No states yet. Add one with the Add state button.' }));
  }

  /** The names offered in a From or To picker. States that share a name are told apart by number. */
  private choices(extra: { id: string; name: string }): { id: string; name: string }[] {
    const seen = new Map<string, number>();
    const states = this.d.states.map((s) => {
      const base = nameOf(s.name) || 'Unnamed state';
      const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
      seen.set(base.toLowerCase(), n);
      return { id: s.id, base, n };
    });
    const totals = new Map<string, number>();
    for (const s of states) totals.set(s.base.toLowerCase(), (totals.get(s.base.toLowerCase()) ?? 0) + 1);
    return [extra, ...states.map((s) => ({ id: s.id, name: (totals.get(s.base.toLowerCase()) ?? 0) > 1 ? `${s.base} (${s.n})` : s.base }))];
  }

  private renderTransitions(): void {
    const { transitions } = this.d;
    const head = h(
      'div',
      { class: 'volcanic-st-row volcanic-st-trans volcanic-st-head', attrs: { 'aria-hidden': 'true' } },
      h('span'),
      h('span', { text: 'From' }),
      h('span'),
      h('span', { text: 'To' }),
      h('span', { text: 'Label' }),
      h('span'),
    );
    const fromChoices = this.choices({ id: START, name: 'Start' });
    const toChoices = this.choices({ id: END, name: 'End' });
    const rows = transitions.map((t, index) => {
      const pick = (side: 'from' | 'to', choices: { id: string; name: string }[]): HTMLSelectElement => {
        const select = selectControl(choices, this.d.states.some((s) => s.id === t[side]) || t[side] === (side === 'from' ? START : END) ? t[side] : choices[0].id, (value) => {
          t[side] = value;
          this.commit();
          this.host.announce(`Transition ${index + 1} now goes ${this.describe(t)}.`);
        });
        select.setAttribute('aria-label', `${side === 'from' ? 'From' : 'To'} of transition ${index + 1}`);
        select.dataset.key = `${side}:${t.id}`;
        return select;
      };
      const label = h('input', {
        class: 'volcanic-input',
        attrs: { type: 'text', autocomplete: 'off', 'aria-label': `Label of transition ${index + 1}`, 'data-key': `label:${t.id}`, placeholder: 'What triggers it' },
      });
      label.value = t.label;
      label.addEventListener('input', () => {
        t.label = label.value;
        this.history.push(this.d, `label:${t.id}`);
        this.host.changed();
        this.renderNotes();
      });
      const row = h(
        'div',
        { class: 'volcanic-st-row volcanic-st-trans' },
        this.moveButtons('transition', t.id, index, transitions.length, (by) => this.moveTransition(t.id, by)),
        pick('from', fromChoices),
        h('span', { class: 'volcanic-st-arrow', text: '→', attrs: { 'aria-hidden': 'true' } }),
        pick('to', toChoices),
        label,
        this.small(`Remove transition ${index + 1}`, 'x', `rmt:${t.id}`, () => this.removeTransition(t.id)),
      );
      row.addEventListener('keydown', (event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        this.moveTransition(t.id, event.key === 'ArrowUp' ? -1 : 1, (event.target as HTMLElement).dataset.key);
      });
      return row;
    });
    // Typing in a state name rebuilds the pickers, so keep the one that has focus.
    const active = document.activeElement;
    const keep = active instanceof HTMLElement && this.transList.contains(active) ? active.dataset.key : undefined;
    this.transList.replaceChildren(...(rows.length ? [head, ...rows] : []));
    if (!rows.length) this.transList.append(h('p', { class: 'volcanic-hint', text: 'No transitions yet. Add one with the Add transition button.' }));
    if (keep) this.transList.querySelector<HTMLElement>(`[data-key="${keep}"]`)?.focus();
  }

  private renderOptions(): void {
    this.options.replaceChildren(
      field(
        'Direction',
        selectControl(DIRECTIONS, this.d.direction, (value) => {
          this.d.direction = value;
          this.commit();
          this.host.announce(`${DIRECTIONS.find((o) => o.id === value)?.name ?? value}.`);
        }),
        'Which way the diagram flows.',
      ),
    );
  }

  private renderNotes(): void {
    for (const s of this.d.states) {
      const count = this.counts.get(s.id);
      if (!count) continue;
      const { into, out } = usesOf(this.d, s.id);
      count.textContent = `${into} in, ${out} out`;
    }
    const names = (list: StateBox[]): string => list.map((s) => nameOf(s.name) || 'unnamed state').join(', ');
    const { unreachable, stuck, alone } = loose(this.d);
    const dupes = duplicateNames(this.d);
    const messages: string[] = [];
    if (dupes.length) messages.push(`⚠ More than one state is called ${dupes.join(', ')}. They stay separate boxes, so give them different names to tell them apart.`);
    if (alone.length) messages.push(`${names(alone)} ${alone.length === 1 ? 'has' : 'have'} no transitions.`);
    if (unreachable.length) messages.push(`Nothing leads to ${names(unreachable)}.`);
    if (stuck.length) messages.push(`${names(stuck)} ${stuck.length === 1 ? 'has' : 'have'} no way out, which is fine for a final state.`);
    const blank = this.d.states.filter((s) => !nameOf(s.name)).length;
    if (blank) messages.push(`${blank} ${blank === 1 ? 'state has' : 'states have'} no name and will be called State.`);
    this.warning.hidden = !messages.length;
    this.warning.textContent = messages.join(' ');
    const { states, transitions } = this.d;
    this.summary.textContent = `${states.length} ${states.length === 1 ? 'state' : 'states'}, ${transitions.length} ${transitions.length === 1 ? 'transition' : 'transitions'}.`;
  }
}

export { starterState };
