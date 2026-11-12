import { readTaskDetails } from './mermaid';
import { heal, keepSize, resizeView, viewBoxOf } from './viewbox';

const NS = 'http://www.w3.org/2000/svg';
/** Space between a bar or its label and the details text. */
const GAP = 8;

const STATUS_WORDS: [string, string][] = [
  ['pele-done', 'Done'],
  ['pele-active', 'In progress'],
];

function take(svg: SVGSVGElement): void {
  svg.querySelectorAll('.volcanic-progress, .volcanic-detail').forEach((el) => el.remove());
  const extra = Number(svg.getAttribute('data-volcanic-dw'));
  if (Number.isFinite(extra) && extra > 0) {
    const box = viewBoxOf(svg);
    if (box) resizeView(svg, box[2] - extra);
  }
  svg.removeAttribute('data-volcanic-dw');
  svg.removeAttribute('data-volcanic-vbw');
  svg.removeAttribute('data-volcanic-details');
}

/**
 * Show who each Gantt task is assigned to, its status and how far along it is: a darker fill across
 * the bar for the percentage, and a line of text after the bar. Safe to call again after every redraw.
 */
export function setTaskDetails(root: Element, source: string, enabled: boolean): void {
  const svg = root.matches('svg') ? (root as SVGSVGElement) : root.querySelector<SVGSVGElement>('svg');
  const tasks = svg?.querySelector(':scope > g.pele-tasks');
  if (!svg || !tasks) return;

  const details = enabled ? readTaskDetails(source) : {};
  const groups = Array.from(tasks.querySelectorAll<SVGGElement>(':scope > g.pele-task'));
  const wanted = groups.map((g) => {
    const id = g.getAttribute('data-id') ?? '';
    const d = details[id];
    const status = STATUS_WORDS.find(([cls]) => g.classList.contains(cls))?.[1] ?? '';
    const parts = enabled ? [d?.assignee ?? '', status, d && d.progress > 0 ? `${d.progress}%` : ''].filter(Boolean) : [];
    return { g, parts, progress: d?.progress ?? 0 };
  });
  const key = JSON.stringify(wanted.map((w) => [w.g.getAttribute('data-id'), w.parts, w.progress]));
  const needed = wanted.some((w) => w.parts.length || w.progress);
  const marked = svg.querySelector('.volcanic-detail, .volcanic-progress') !== null;
  if (svg.getAttribute('data-volcanic-details') === key && (marked || !needed)) {
    heal(svg);
    return;
  }
  if (svg.hasAttribute('data-volcanic-details') || marked) take(svg);
  if (!needed) return;

  const box = viewBoxOf(svg);
  // A hidden picture cannot be measured; a later redraw tries again.
  if (!box || svg.getBoundingClientRect().width === 0) return;
  const size = (Number(tasks.getAttribute('font-size')) || 13) * 0.9;
  const right = box[0] + box[2];
  let farthest = 0;

  for (const { g, parts, progress } of wanted) {
    const bar = g.querySelector<SVGRectElement>(':scope > rect');
    if (bar && progress > 0) {
      const fill = document.createElementNS(NS, 'rect');
      fill.setAttribute('class', 'volcanic-progress');
      fill.setAttribute('aria-hidden', 'true');
      for (const name of ['x', 'y', 'height']) fill.setAttribute(name, bar.getAttribute(name) ?? '0');
      fill.setAttribute('width', String((Number(bar.getAttribute('width')) * progress) / 100));
      fill.setAttribute('fill', 'var(--_fg)');
      fill.setAttribute('fill-opacity', '0.28');
      fill.setAttribute('style', 'rx:var(--_r)');
      fill.style.pointerEvents = 'none';
      bar.after(fill);
    }
    if (!parts.length) continue;
    const label = g.querySelector<SVGTextElement>(':scope > text.pele-label');
    const bounds = g.getBBox();
    const y = Number(label?.getAttribute('y')) || bounds.y + bounds.height * 0.7;
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('class', 'volcanic-detail');
    text.setAttribute('x', String(bounds.x + bounds.width + GAP));
    text.setAttribute('y', String(y));
    text.setAttribute('font-size', String(size));
    text.setAttribute('fill', 'var(--_m)');
    text.textContent = parts.join(' · ');
    g.append(text);
    farthest = Math.max(farthest, g.getBBox().x + g.getBBox().width);
  }

  if (farthest + GAP > right) {
    const extra = Math.ceil(farthest + GAP - right);
    resizeView(svg, box[2] + extra);
    svg.setAttribute('data-volcanic-dw', String(extra));
    svg.setAttribute('data-volcanic-vbw', String(box[2] + extra));
    keepSize(svg);
  }
  svg.setAttribute('data-volcanic-details', key);
}
