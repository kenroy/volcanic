import type { TitleAlign } from './model';
import { heal, keepSize, resizeView, viewBoxOf } from './viewbox';

const NS = 'http://www.w3.org/2000/svg';
/** Space kept between the description and the edge of the picture. */
const EDGE = 8;
/** Longest line of the paragraph, in the picture's own units. */
const MAX_LINE = 560;

/** Take a description out again, putting the picture back as Pele drew it. */
function removeDescription(svg: SVGSVGElement): void {
  const group = svg.querySelector(':scope > g.volcanic-desc');
  const body = svg.querySelector(':scope > g.volcanic-body');
  const delta = Number(svg.getAttribute('data-volcanic-dy'));
  if (body) {
    while (body.firstChild) svg.insertBefore(body.firstChild, body);
    body.remove();
  }
  group?.remove();
  // A description we gave the picture for screen readers (none came from Pele) goes too.
  const ours = svg.getAttribute('data-volcanic-descid');
  if (ours) {
    svg.querySelector(`:scope > desc[id="${CSS.escape(ours)}"]`)?.remove();
    if (svg.getAttribute('aria-describedby') === ours) svg.removeAttribute('aria-describedby');
    svg.removeAttribute('data-volcanic-descid');
  }
  const box = viewBoxOf(svg);
  if (box && Number.isFinite(delta) && delta > 0) resizeView(svg, undefined, box[3] - delta);
  svg.removeAttribute('data-volcanic-dy');
  svg.removeAttribute('data-volcanic-vbh');
}

/** Split text into lines no wider than `max`, measured as they will be drawn. */
function wrap(text: SVGTextElement, words: string[], max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    text.textContent = attempt;
    if (line && text.getComputedTextLength() > max) {
      lines.push(line);
      line = word;
    } else line = attempt;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Show a diagram's description as a paragraph directly under its title, inside the picture,
 * pushing the rest of the drawing down to make room. Safe to call again after every redraw.
 */
export function setDescription(root: Element, description: string, align: TitleAlign): void {
  const svg = root.instanceOf(SVGSVGElement) ? root : root.querySelector<SVGSVGElement>('svg');
  if (!svg) return;
  const key = `${align}|${description}`;
  const existing = svg.querySelector(':scope > g.volcanic-desc');
  if (existing?.getAttribute('data-key') === key) {
    heal(svg);
    return;
  }
  if (existing) removeDescription(svg);
  else svg.removeAttribute('data-volcanic-dy');
  if (!description) return;

  const box = viewBoxOf(svg);
  const ctm = svg.getScreenCTM();
  const rect = svg.getBoundingClientRect();
  // A hidden picture cannot be measured; a later redraw tries again.
  if (!box || !ctm || rect.width === 0 || !svg.querySelector('text')) return;
  const inverse = ctm.inverse();
  const point = (x: number, y: number): DOMPoint => new DOMPoint(x, y).matrixTransform(inverse);

  const title = svg.querySelector('text.pele-title, text[class$="TitleText"]');
  let bottom = box[1];
  let left = box[0] + EDGE;
  let right = box[0] + box[2] - EDGE;
  let titleSize = 16;
  if (title) {
    const r = title.getBoundingClientRect();
    bottom = point(r.right, r.bottom).y;
    left = point(r.left, r.top).x;
    right = point(r.right, r.bottom).x;
    titleSize = parseFloat(getComputedStyle(title).fontSize) || 16;
  }
  const size = Math.max(11, Math.round(titleSize * 0.8));
  const lineHeight = size * 1.4;
  const center = box[0] + box[2] / 2;
  const x = align === 'left' ? left : align === 'right' ? right : center;
  const available = align === 'left' ? box[0] + box[2] - EDGE - x : align === 'right' ? x - box[0] - EDGE : box[2] - 2 * EDGE;
  const max = Math.max(80, Math.min(MAX_LINE, available));

  const text = document.createElementNS(NS, 'text');
  text.setAttribute('font-size', String(size));
  text.setAttribute('text-anchor', align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle');
  text.setAttribute('fill', 'var(--pele-muted, #6e6e6e)');
  const group = document.createElementNS(NS, 'g');
  group.setAttribute('class', 'volcanic-desc');
  group.setAttribute('data-key', key);
  group.setAttribute('aria-hidden', 'true');
  group.append(text);
  svg.append(group);
  // Pele only names a description it finds in an accDescr line. Where there is none (mind maps), give the picture one.
  if (!svg.hasAttribute('aria-describedby')) {
    const id = `volcanic-desc-${Math.random().toString(36).slice(2, 9)}`;
    const desc = document.createElementNS(NS, 'desc');
    desc.setAttribute('id', id);
    desc.textContent = description;
    svg.prepend(desc);
    svg.setAttribute('aria-describedby', id);
    svg.setAttribute('data-volcanic-descid', id);
  }

  const lines = wrap(text, description.split(/\s+/).filter(Boolean), max);
  text.textContent = '';
  lines.forEach((line, index) => {
    const span = document.createElementNS(NS, 'tspan');
    span.setAttribute('x', String(x));
    span.setAttribute('y', String(bottom + size * 1.1 + 4 + index * lineHeight));
    span.textContent = line;
    text.append(span);
  });
  const delta = Math.ceil(lines.length * lineHeight + 8);

  // Everything except the title moves down by the height of the paragraph.
  const keep = new Set<Element>([group]);
  for (let el: Element | null = title; el && el !== svg; el = el.parentElement) if ((el.parentElement as Element | null) === svg) keep.add(el);
  const moving = Array.from(svg.children).filter((child) => !keep.has(child) && !/^(defs|style|title|desc)$/i.test(child.tagName));
  const body = document.createElementNS(NS, 'g');
  body.setAttribute('class', 'volcanic-body');
  body.setAttribute('transform', `translate(0 ${delta})`);
  svg.insertBefore(body, moving[0] ?? group);
  for (const child of moving) body.append(child);

  resizeView(svg, undefined, box[3] + delta);
  svg.setAttribute('data-volcanic-dy', String(delta));
  svg.setAttribute('data-volcanic-vbh', String(box[3] + delta));
  keepSize(svg);
}
