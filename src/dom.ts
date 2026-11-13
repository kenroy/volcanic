import type { Shape } from './model';

type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };
}

/** Small element builder so the editor has no framework or Obsidian dependency. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = createEl(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  setAttrs(el, props.attrs);
  if (props.on) {
    for (const [type, handler] of Object.entries(props.on)) {
      el.addEventListener(type, handler as EventListener);
    }
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Props['attrs'] = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  setAttrs(el, attrs);
  for (const child of children) if (child) el.append(child);
  return el;
}

export function setAttrs(el: Element, attrs: Props['attrs']): void {
  if (!attrs) return;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) el.removeAttribute(name);
    else el.setAttribute(name, value === true ? '' : String(value));
  }
}

let uid = 0;
export function uniqueId(prefix: string): string {
  uid += 1;
  return `${prefix}-${uid}`;
}

/** A small decorative picture of a shape, for the palette and shape picker. */
export function shapeIcon(shape: Shape): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 32 22', width: 32, height: 22, 'aria-hidden': 'true', focusable: 'false', class: 'volcanic-shape-icon' });
  switch (shape) {
    case 'rect':
      svg.append(s('rect', { x: 2, y: 3, width: 28, height: 16 }));
      break;
    case 'rounded':
      svg.append(s('rect', { x: 2, y: 3, width: 28, height: 16, rx: 4 }));
      break;
    case 'stadium':
      svg.append(s('rect', { x: 2, y: 3, width: 28, height: 16, rx: 8 }));
      break;
    case 'diamond':
      svg.append(s('polygon', { points: '16,1.5 30,11 16,20.5 2,11' }));
      break;
    case 'circle':
      svg.append(s('circle', { cx: 16, cy: 11, r: 9 }));
      break;
    case 'hexagon':
      svg.append(s('polygon', { points: '8,3 24,3 30,11 24,19 8,19 2,11' }));
      break;
    case 'parallelogram':
      svg.append(s('polygon', { points: '8,3 30,3 24,19 2,19' }));
      break;
    case 'cylinder':
      svg.append(s('path', { d: 'M4,6 a12,3.5 0 0 0 24,0 a12,3.5 0 0 0 -24,0 v10 a12,3.5 0 0 0 24,0 v-10' }));
      break;
    case 'subroutine':
      svg.append(s('rect', { x: 2, y: 3, width: 28, height: 16 }), s('path', { d: 'M6.5,3 v16 M25.5,3 v16' }));
      break;
  }
  return svg;
}

/** Stretchable outline drawn behind a node for shapes CSS borders cannot make. */
export function nodeOutline(shape: Shape): SVGSVGElement | null {
  const attrs = { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false', class: 'volcanic-node-outline' };
  switch (shape) {
    case 'diamond':
      return s('svg', attrs, s('polygon', { points: '50,1 99,50 50,99 1,50' }));
    case 'hexagon':
      return s('svg', attrs, s('polygon', { points: '9,1 91,1 99,50 91,99 9,99 1,50' }));
    case 'parallelogram':
      return s('svg', attrs, s('polygon', { points: '11,1 99,1 89,99 1,99' }));
    case 'circle':
      return s('svg', attrs, s('ellipse', { cx: 50, cy: 50, rx: 49, ry: 49 }));
    case 'cylinder':
      return s('svg', attrs, s('path', { d: 'M1,14 C1,-3 99,-3 99,14 V86 C99,103 1,103 1,86 Z' }), s('path', { d: 'M1,14 C1,31 99,31 99,14', class: 'volcanic-node-outline-detail' }));
    default:
      return null;
  }
}

export interface TabSpec {
  id: string;
  name: string;
  panel: HTMLElement;
}

export interface Tabs {
  list: HTMLElement;
  select(id: string, focus?: boolean): void;
  current(): string;
}

/** Tabs following the WAI-ARIA pattern: arrow keys move, selection follows focus. */
export function createTabs(label: string, specs: TabSpec[], onChange?: (id: string) => void): Tabs {
  const base = uniqueId('volcanic-tab');
  const list = h('div', { class: 'volcanic-tabs', attrs: { role: 'tablist', 'aria-label': label } });
  const buttons = new Map<string, HTMLButtonElement>();
  let active = specs[0].id;

  const select = (id: string, focus = false): void => {
    active = id;
    for (const spec of specs) {
      const on = spec.id === id;
      const button = buttons.get(spec.id)!;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      spec.panel.hidden = !on;
      if (on && focus) button.focus();
    }
    onChange?.(id);
  };

  specs.forEach((spec, index) => {
    const tabId = `${base}-${spec.id}`;
    const panelId = `${base}-${spec.id}-panel`;
    const button = h('button', {
      class: 'volcanic-tab',
      text: spec.name,
      attrs: { type: 'button', role: 'tab', id: tabId, 'aria-controls': panelId },
      on: {
        click: () => select(spec.id),
        keydown: (event) => {
          let next = -1;
          if (event.key === 'ArrowRight') next = (index + 1) % specs.length;
          else if (event.key === 'ArrowLeft') next = (index - 1 + specs.length) % specs.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = specs.length - 1;
          if (next < 0) return;
          event.preventDefault();
          select(specs[next].id, true);
        },
      },
    });
    buttons.set(spec.id, button);
    list.append(button);
    setAttrs(spec.panel, { role: 'tabpanel', id: panelId, 'aria-labelledby': tabId });
  });

  select(active);
  return { list, select, current: () => active };
}
