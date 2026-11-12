import { formatDay, ganttFromMermaid, resolveSpans } from './gantt';
import { groupByPlace, holidayColour, holidaysForPlaces, placeIndexes } from './holidays';

const NS = 'http://www.w3.org/2000/svg';
/** Most holidays named in the text under the chart. */
const LEGEND_MAX = 12;

function readHidden(key: string | undefined): string[] {
  if (!key) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeHidden(key: string | undefined, hidden: Set<string>): void {
  if (!key) return;
  try {
    if (hidden.size) window.localStorage.setItem(key, JSON.stringify(Array.from(hidden)));
    else window.localStorage.removeItem(key);
  } catch {
    // The switches still work for this session.
  }
}

function clear(svg: SVGSVGElement): void {
  svg.querySelectorAll('g.volcanic-holidays').forEach((el) => el.remove());
  svg.removeAttribute('data-volcanic-holidays');
  svg.parentElement?.querySelectorAll(':scope > .volcanic-holiday-legend').forEach((el) => el.remove());
}

/**
 * Mark public holidays on a Gantt chart drawn by Pele: a faint band across each holiday, and (for notes)
 * a line of text under the chart naming them, so the information is not only in colour.
 * Safe to call again after every redraw.
 */
export function setHolidayBands(root: Element, source: string, options: { legend: boolean; /** Where the countries switched off in the legend are remembered. */ storageKey?: string }): void {
  const svg = root.matches('svg') ? (root as SVGSVGElement) : root.querySelector<SVGSVGElement>('svg');
  if (!svg || !svg.querySelector(':scope > g.pele-tasks')) return;
  const parsed = ganttFromMermaid(source);
  const choices = parsed.ok ? parsed.diagram.holidays.filter((c) => c.country) : [];
  if (!parsed.ok || !choices.length) {
    if (svg.hasAttribute('data-volcanic-holidays')) clear(svg);
    return;
  }

  // Work out where a day sits on the picture from a task whose start and length are known.
  const spans = resolveSpans(parsed.diagram);
  let anchor: { x: number; start: number; perDay: number } | null = null;
  for (const task of parsed.diagram.sections.flatMap((s) => s.tasks)) {
    const span = spans.get(task.id);
    const bar = svg.querySelector<SVGRectElement>(`g.pele-task[data-id="${CSS.escape(task.id)}"] > rect`);
    if (!span || !bar || task.milestone || task.duration < 1) continue;
    const width = Number(bar.getAttribute('width'));
    const x = Number(bar.getAttribute('x'));
    if (width > 0 && Number.isFinite(x)) {
      anchor = { x, start: span.start, perDay: width / task.duration };
      break;
    }
  }
  const sections = svg.querySelector<SVGGElement>(':scope g.pele-sections');
  // The grid runs exactly as far as the timeline does.
  const axis = svg.querySelector<SVGGraphicsElement>(':scope g.pele-grid');
  if (!anchor || !sections || !axis || svg.getBoundingClientRect().width === 0) return;
  const area = sections.getBBox();
  const line = axis.getBBox();
  if (area.height === 0 || line.width === 0) return;

  const dayAt = (x: number): number => anchor.start + (x - anchor.x) / anchor.perDay;
  const left = line.x;
  const right = line.x + line.width;
  const hidden = new Set(readHidden(options.storageKey));
  const found = holidaysForPlaces(choices, Math.ceil(dayAt(left) - 1), Math.floor(dayAt(right)));
  const key = JSON.stringify([choices, found, Array.from(hidden), Math.round(anchor.perDay * 100), Math.round(area.y), Math.round(area.height), Math.round(left), Math.round(right), options.legend]);
  const hasGroup = svg.querySelector('g.volcanic-holidays') !== null;
  if (svg.getAttribute('data-volcanic-holidays') === key && (hasGroup || !found.length)) return;
  const hadFocus = svg.parentElement?.querySelector('.volcanic-holiday-legend')?.contains(document.activeElement) ?? false;
  const focusedPlace = hadFocus ? (document.activeElement as HTMLElement).dataset.place : undefined;
  clear(svg);

  const colours = placeIndexes(choices);
  if (found.length) {
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('class', 'volcanic-holidays');
    group.setAttribute('aria-hidden', 'true');
    // Countries that share a day split it into side-by-side stripes, one colour each.
    const byDay = new Map<number, typeof found>();
    for (const holiday of found) byDay.set(holiday.day, [...(byDay.get(holiday.day) ?? []), holiday]);
    for (const [day, onThatDay] of byDay) {
      const places = Array.from(new Set(onThatDay.map((x) => x.place)));
      const full0 = anchor.x + (day - anchor.start) * anchor.perDay;
      const full1 = anchor.x + (day + 1 - anchor.start) * anchor.perDay;
      places.forEach((place, i) => {
        const x0 = Math.max(left, full0 + ((full1 - full0) * i) / places.length);
        const x1 = Math.min(right, full0 + ((full1 - full0) * (i + 1)) / places.length);
        if (x1 <= x0) return;
        const band = document.createElementNS(NS, 'rect');
        band.setAttribute('x', String(x0));
        band.setAttribute('y', String(area.y));
        band.setAttribute('width', String(x1 - x0));
        band.setAttribute('height', String(area.height));
        band.setAttribute('fill', holidayColour(colours.get(place) ?? 0));
        band.setAttribute('fill-opacity', choices.length > 1 ? '0.2' : '0.17');
        band.dataset.place = place;
        if (hidden.has(place)) band.style.display = 'none';
        const title = document.createElementNS(NS, 'title');
        title.textContent = onThatDay
          .filter((x) => x.place === place)
          .map((x) => `${formatDay(day)}: ${x.name}${choices.length > 1 ? ` (${x.place})` : ''}`)
          .join('; ');
        band.append(title);
        group.append(band);
      });
    }
    sections.after(group);
  }

  if (options.legend && svg.parentElement) {
    const noun = choices.every((c) => !c.include) ? 'Public holidays' : 'Holidays';
    const legend = document.createElement('div');
    legend.className = 'volcanic-holiday-legend';
    legend.setAttribute('role', 'group');
    legend.setAttribute('aria-label', `${noun} by country`);
    if (!found.length) {
      legend.append(Object.assign(document.createElement('p'), { className: 'volcanic-holiday-none', textContent: `No ${noun.toLowerCase()} fall within this chart.` }));
    } else {
      legend.append(Object.assign(document.createElement('div'), { className: 'volcanic-holiday-heading', textContent: noun }));
      let n = 0;
      for (const g of groupByPlace(found, choices)) {
        n += 1;
        const line = document.createElement('label');
        line.className = `volcanic-holiday-line${hidden.has(g.place) ? ' is-off' : ''}`;
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !hidden.has(g.place);
        box.dataset.place = g.place;
        const describedBy = `volcanic-holiday-${Math.random().toString(36).slice(2, 8)}-${n}`;
        box.setAttribute('aria-describedby', describedBy);
        const swatch = document.createElement('span');
        swatch.className = 'volcanic-holiday-swatch';
        swatch.setAttribute('aria-hidden', 'true');
        swatch.style.setProperty('--holiday', holidayColour(colours.get(g.place) ?? 0));
        const text = document.createElement('span');
        text.className = 'volcanic-holiday-text';
        const name = document.createElement('strong');
        name.textContent = g.place;
        const list = document.createElement('span');
        list.id = describedBy;
        const first = g.holidays.slice(0, LEGEND_MAX).map((hol) => `${formatDay(hol.day, false)} ${hol.name}`);
        const more = g.holidays.length > LEGEND_MAX ? `, and ${g.holidays.length - LEGEND_MAX} more` : '';
        list.textContent = g.holidays.length ? `: ${first.join(', ')}${more}.` : ': none during this chart.';
        text.append(name, list);
        line.append(box, swatch, text);
        // Switch this country's bands on or off right here, without redrawing anything.
        const sync = (): void => {
          const on = box.checked;
          if (on === !hidden.has(g.place)) return;
          if (on) hidden.delete(g.place);
          else hidden.add(g.place);
          writeHidden(options.storageKey, hidden);
          line.classList.toggle('is-off', !on);
          svg.querySelectorAll<SVGElement>('g.volcanic-holidays rect').forEach((band) => {
            if (band.dataset.place === g.place) band.style.display = on ? '' : 'none';
          });
          // The next redraw rebuilds from the saved choice, so let it.
          svg.removeAttribute('data-volcanic-holidays');
        };
        box.addEventListener('change', sync);
        box.addEventListener('click', sync);
        legend.append(line);
      }
    }
    svg.after(legend);
    if (focusedPlace) Array.from(legend.querySelectorAll<HTMLInputElement>('input')).find((el) => el.dataset.place === focusedPlace)?.focus();
  }
  svg.setAttribute('data-volcanic-holidays', key);
}
