// Round-trip tests for the Mermaid generator/importer, bundled on the fly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import { render } from 'pele';

const bundle = await esbuild.build({ entryPoints: ['src/all.ts'], bundle: true, format: 'esm', write: false, platform: 'node' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const { toMermaid, fromMermaid, stripMeta, readTitle, setTitle, readTitleAlign, setTitleAlign, TEMPLATES, seqToMermaid, seqFromMermaid, ganttToMermaid, ganttFromMermaid, resolveSpans, toDay, toIso, THEMES, contrast, readTheme, setTheme, holidaysBetween, countryOptions, regionOptions, readHolidayPlaces, setHolidayPlaces, holidaysForPlaces, groupByPlace, placeIndexes, autoLayout, estimateSize, readFontSize, setFontSize, TEXT_SIZES, mindToMermaid, mindFromMermaid, moveNode, findNode, parentOf, flatten, starterMindMap, countNodes, readDescription, journeyToMermaid, journeyFromMermaid, moveStep: moveJourneyStep, starterJourney, allSteps: allJourneySteps, actorsOf, pieToMermaid, pieFromMermaid, starterPie, percentOf, radarToMermaid, radarFromMermaid, starterRadar, quadrantToMermaid, quadrantFromMermaid, starterQuadrant, timelineToMermaid, timelineFromMermaid, starterTimeline, shiftPeriod, xyChartToMermaid, xyChartFromMermaid, starterXyChart, kanbanToMermaid, kanbanFromMermaid, starterKanban, moveCard: moveKanbanCard, sankeyToMermaid, sankeyFromMermaid, starterSankey, loopsIn, totalsOf, treemapToMermaid, treemapFromMermaid, starterTreemap, sizeOf, indentNode, outdentNode, shiftNode, flattenTree } = mod;

const SHAPES = ['rect', 'rounded', 'stadium', 'diamond', 'circle', 'hexagon', 'parallelogram', 'cylinder', 'subroutine'];

test('every shape, line and arrow style survives a round trip', () => {
  const nodes = SHAPES.map((shape, i) => ({ id: `n${i + 1}`, label: `Label ${shape}`, shape, x: i * 10, y: i * 20 }));
  const edges = [];
  let k = 0;
  for (const line of ['solid', 'dotted', 'thick']) {
    for (const arrow of ['arrow', 'none', 'both']) {
      k++;
      edges.push({ id: `e${k}`, from: `n${k}`, to: `n${(k % 9) + 1}`, label: k % 2 ? `edge ${k}` : '', line, arrow });
    }
  }
  const diagram = { title: 'Order: "approval" #1 process', description: 'Shows how an order is approved, step by step.', titleAlign: 'right', direction: 'LR', nodes, edges };
  const result = fromMermaid(toMermaid(diagram));
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.diagram, diagram);
});

test('awkward label text survives and Pele renders it', () => {
  const diagram = {
    title: '',
    description: '',
    titleAlign: 'center',
    direction: 'TD',
    nodes: [
      { id: 'n1', label: 'Say "hi" #1\nsecond line', shape: 'rect', x: 0, y: 0 },
      { id: 'n2', label: 'a | b & (c) [d] {e} <f>', shape: 'diamond', x: 50, y: 60 },
      { id: 'n3', label: '', shape: 'circle', x: 5, y: 6 },
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2', label: 'yes "maybe" | no', line: 'solid', arrow: 'arrow' }, { id: 'e2', from: 'n3', to: 'n3', label: '', line: 'solid', arrow: 'arrow' }],
  };
  const source = toMermaid(diagram);
  const result = fromMermaid(source);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.diagram, diagram);
  const { svg } = render(stripMeta(source));
  assert.match(svg, /Say/);
  assert.doesNotMatch(svg, /volcanic/);
});

test('plain hand-written flowcharts import and get a layout', () => {
  const result = fromMermaid('graph LR\n  A[Start] --> B{Choice}\n  B -- yes --> C(Done)\n  B -->|no| A');
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.diagram.direction, 'LR');
  assert.deepEqual(result.diagram.nodes.map((n) => [n.id, n.label, n.shape]), [['A', 'Start', 'rect'], ['B', 'Choice', 'diamond'], ['C', 'Done', 'rounded']]);
  assert.equal(result.diagram.edges.length, 3);
  assert.equal(result.diagram.edges[1].label, 'yes');
  const positions = new Set(result.diagram.nodes.map((n) => `${n.x},${n.y}`));
  assert.equal(positions.size, 3, 'nodes should not overlap');
});

test('unsupported diagrams are refused, not mangled', () => {
  assert.equal(fromMermaid('sequenceDiagram\n A->>B: hi').ok, false);
  assert.equal(fromMermaid('flowchart TD\n subgraph one\n a-->b\n end').ok, false);
  assert.equal(fromMermaid('flowchart TD\n a-->b\n style a fill:#f00').ok, false);
  assert.equal(fromMermaid('flowchart TD\n a --o b').ok, false);
  assert.equal(fromMermaid('flowchart TD\n a -->').ok, false);
});

test('every template renders in Pele', () => {
  for (const template of TEMPLATES) assert.ok(render(template.source).svg.length > 100, template.id);
});

test('titles: written for sighted and screen-reader users, and read back', () => {
  const diagram = { title: 'Release flow', description: 'From commit to production.', titleAlign: 'center', direction: 'TD', nodes: [{ id: 'n1', label: 'Commit', shape: 'rect', x: 0, y: 0 }], edges: [] };
  const source = toMermaid(diagram);
  assert.equal(readTitle(source), 'Release flow');
  const { svg } = render(stripMeta(source));
  assert.match(svg, /<title[^>]*>Release flow<\/title>/);
  assert.match(svg, /<desc[^>]*>From commit to production\.<\/desc>/);
  assert.ok(svg.replace(/<title.*?<\/title>/, '').includes('Release flow'), 'title is also drawn visibly');
});

test('setTitle works on any diagram type and is reversible', () => {
  for (const template of TEMPLATES) {
    const titled = setTitle(template.source, 'My "quoted": title');
    assert.equal(readTitle(titled), 'My "quoted": title', template.id);
    assert.ok(render(titled).svg.length > 100, template.id);
    assert.equal(readTitle(setTitle(titled, 'Second')), 'Second', template.id);
    // A title that sits on its own line (gantt, pie) is replaced in place and removed again when cleared.
    const untitled = template.source.replace(/^[ \t]*title[ \t]+\S.*\r?\n/m, '');
    assert.equal(setTitle(titled, ''), untitled, template.id);
    assert.equal(titled.includes('---'), !/^[ \t]*title[ \t]+\S/m.test(template.source), template.id);
  }
  assert.equal(readTitle('flowchart TD\n  accTitle: Only accessible\n  a-->b'), 'Only accessible');
  assert.equal(readTitle('flowchart TD\n a-->b'), '');
  const withConfig = '---\nconfig:\n  theme: dark\n---\nflowchart TD\n a-->b';
  assert.equal(setTitle(setTitle(withConfig, 'T'), ''), withConfig);
});

test('title position is stored in the comment for any diagram type and still renders', () => {
  for (const template of TEMPLATES) {
    const titled = setTitle(template.source, 'T');
    const left = setTitleAlign(titled, 'left');
    assert.equal(readTitleAlign(left), 'left', template.id);
    assert.ok(render(left).svg.includes('pele-title'), `${template.id} renders with the comment present`);
    assert.equal(readTitleAlign(setTitleAlign(left, 'right')), 'right', template.id);
    assert.equal(setTitleAlign(left, 'center'), titled, template.id);
  }
  // Changing the position keeps saved shape positions.
  const flow = toMermaid({ title: 'T', description: '', titleAlign: 'center', direction: 'TD', nodes: [{ id: 'n1', label: 'A', shape: 'rect', x: 40, y: 50 }], edges: [] });
  const moved = fromMermaid(setTitleAlign(flow, 'left'));
  assert.equal(moved.diagram.titleAlign, 'left');
  assert.deepEqual([moved.diagram.nodes[0].x, moved.diagram.nodes[0].y], [40, 50]);
  assert.equal(setTitleAlign(setTitleAlign(flow, 'left'), 'center'), flow);
});

test('sequence diagrams round-trip and render', () => {
  const diagram = {
    participants: [
      { id: 'p1', label: 'Alice #1; "the first"', actor: false },
      { id: 'p2', label: 'Bob', actor: true },
      { id: 'p3', label: 'Carol', actor: false },
    ],
    steps: [
      { kind: 'message', id: 's1', from: 'p1', to: 'p2', text: 'Hi; there #5: ok\nsecond line', style: 'solid' },
      { kind: 'message', id: 's2', from: 'p2', to: 'p1', text: 'back', style: 'dotted' },
      { kind: 'message', id: 's3', from: 'p1', to: 'p3', text: 'no wait', style: 'async' },
      { kind: 'message', id: 's4', from: 'p3', to: 'p3', text: 'self', style: 'lost' },
      { kind: 'note', id: 's5', place: 'right', targets: ['p1'], text: 'a note' },
      { kind: 'note', id: 's6', place: 'over', targets: ['p1', 'p3'], text: 'wide\nnote' },
      { kind: 'note', id: 's7', place: 'left', targets: ['p2'], text: '' },
    ],
    autonumber: true,
  };
  diagram.steps[6].text = 'left';
  const source = seqToMermaid(diagram, { title: 'My: "title"', description: 'About it.' });
  const result = seqFromMermaid(source);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.diagram, diagram);
  assert.equal(result.title, 'My: "title"');
  assert.equal(result.description, 'About it.');
  const { svg } = render(source);
  assert.match(svg, /<title[^>]*>My: &quot;title&quot;<\/title>/);
  // An empty message still renders.
  assert.ok(render(seqToMermaid({ ...diagram, steps: [{ ...diagram.steps[0], text: '' }] }, { title: 'T', description: '' })).svg.length > 100);
});

test('sequence diagrams the editor cannot hold are refused', () => {
  for (const bad of ['sequenceDiagram\n A->>B: x\n loop y\n A->>B: z\n end', 'sequenceDiagram\n A->>+B: x', 'sequenceDiagram\n box Blue\n participant A\n end', 'sequenceDiagram\n activate A', 'sequenceDiagram\n A->>']) {
    assert.equal(seqFromMermaid(bad).ok, false, bad);
  }
  const hand = seqFromMermaid('sequenceDiagram\n  participant A as Alice\n  A->>B: Hello\n  B-->>A: Hi');
  assert.equal(hand.ok, true);
  assert.deepEqual(hand.diagram.participants.map((p) => [p.id, p.label]), [['A', 'Alice'], ['B', 'B']]);
});

test('gantt charts round-trip and render', () => {
  const d0 = toDay('2026-01-05');
  const diagram = {
    axisFormat: '%b %d',
    holidays: [],
    sections: [
      { id: 'g1', name: 'Design: one #1', tasks: [
        { id: 't1', name: 'Research: a; b', status: 'done', critical: false, milestone: false, start: { type: 'date', day: d0 }, duration: 7, assignee: '', progress: 0 },
        { id: 't2', name: 'Mockups', status: 'active', critical: true, milestone: false, start: { type: 'after', id: 't1' }, duration: 5, assignee: '', progress: 0 },
      ] },
      { id: 'g2', name: 'Build', tasks: [
        { id: 't3', name: 'Launch', status: 'planned', critical: false, milestone: true, start: { type: 'date', day: d0 + 30 }, duration: 0, assignee: '', progress: 0 },
      ] },
    ],
  };
  const source = ganttToMermaid(diagram, { title: 'Plan', description: '' });
  const result = ganttFromMermaid(source);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.diagram, diagram);
  assert.ok(render(source).svg.includes('Research: a; b'));
  const spans = resolveSpans(result.diagram);
  assert.deepEqual(spans.get('t2'), { start: d0 + 7, end: d0 + 12 });
  assert.equal(toIso(toDay('2026-02-28')), '2026-02-28');
  assert.equal(toDay('2026-02-30'), null);
});

test('hand-written gantt charts import, others are refused', () => {
  const hand = ganttFromMermaid('gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section A\n  First :a1, 2026-01-05, 2w\n  Second :after a1, 3d\n  Third :2026-01-20, 2026-01-25');
  assert.equal(hand.ok, true, hand.reason);
  assert.equal(hand.title, 'Plan');
  const tasks = hand.diagram.sections[0].tasks;
  assert.deepEqual(tasks.map((t) => [t.name, t.duration]), [['First', 14], ['Second', 3], ['Third', 5]]);
  assert.deepEqual(tasks[1].start, { type: 'after', id: 'a1' });
  for (const bad of ['gantt\n dateFormat YYYY-MM-DD\n excludes weekends\n T :t1, 2026-01-01, 2d', 'gantt\n dateFormat DD/MM/YYYY\n T :t1, 01/01/2026, 2d', 'gantt\n dateFormat YYYY-MM-DD\n T :2d']) {
    assert.equal(ganttFromMermaid(bad).ok, false, bad);
  }
});

test('gantt tasks that only name themselves follow the previous task, and empty sections survive', () => {
  const source = 'gantt\n\ttitle T\n\tdateFormat YYYY-MM-DD\n\tsection A\n\t\tFirst :a1, 2026-01-01, 2d\n\t\tSecond :b2\n\t\tThird :b3\n\tsection B\n\t\tFourth :c1, after b3, 1d\n\tsection Empty';
  const result = ganttFromMermaid(source);
  assert.ok(result.ok, result.reason);
  const spans = resolveSpans(result.diagram);
  const start = toDay('2026-01-01');
  assert.deepEqual(spans.get('b2'), { start: start + 2, end: start + 3 });
  assert.deepEqual(spans.get('b3'), { start: start + 3, end: start + 4 });
  assert.deepEqual(spans.get('c1'), { start: start + 4, end: start + 5 });
  assert.equal(result.diagram.sections.length, 3);
  const text = ganttToMermaid(result.diagram, { title: result.title, description: result.description });
  assert.ok(ganttFromMermaid(text).ok);
  assert.ok(render(text).svg.length > 100);
});

test('every colour theme keeps text and shapes readable in light and dark mode', () => {
  const modes = [
    ['light', '#222222', '#ffffff'],
    ['dark', '#dadada', '#1e1e1e'],
  ];
  for (const theme of THEMES) {
    if (!theme.light) continue;
    for (const [mode, text, page] of modes) {
      const c = theme[mode];
      const name = `${theme.id} ${mode}`;
      assert.equal(c.series.length, 8, name);
      assert.ok(contrast(text, c.surface) >= 4.5, `${name}: text on surface ${contrast(text, c.surface).toFixed(2)}`);
      assert.ok(contrast(text, c.surfaceAlt) >= 4.5, `${name}: text on alt surface ${contrast(text, c.surfaceAlt).toFixed(2)}`);
      assert.ok(contrast(c.line, page) >= 3, `${name}: lines ${contrast(c.line, page).toFixed(2)}`);
      assert.ok(contrast(c.border, page) >= 3, `${name}: borders ${contrast(c.border, page).toFixed(2)}`);
      assert.ok(contrast(c.border, c.surface) >= 3, `${name}: border on surface ${contrast(c.border, c.surface).toFixed(2)}`);
      assert.ok(contrast(c.accent, page) >= 3, `${name}: accent ${contrast(c.accent, page).toFixed(2)}`);
      for (const colour of [c.accent, c.critical, ...c.series]) {
        const label = Math.max(contrast(colour, '#ffffff'), contrast(colour, '#000000'));
        assert.ok(label >= 4.5, `${name}: label on ${colour} ${label.toFixed(2)}`);
        assert.ok(contrast(colour, page) >= 2.4, `${name}: ${colour} against the page ${contrast(colour, page).toFixed(2)}`);
      }
    }
  }
});

test('the colour theme is kept in the comment, beside the title position, for any diagram type', () => {
  for (const template of TEMPLATES) {
    const titled = setTitle(template.source, 'T');
    const themed = setTheme(setTitleAlign(titled, 'left'), 'ocean');
    assert.equal(readTheme(themed), 'ocean', template.id);
    assert.equal(readTitleAlign(themed), 'left', template.id);
    assert.ok(render(themed).svg.length > 100, `${template.id} still renders`);
    assert.equal(readTheme(setTitleAlign(themed, 'right')), 'ocean', template.id);
    assert.equal(setTheme(themed, ''), setTitleAlign(titled, 'left'), template.id);
    assert.equal(setTheme(titled, ''), titled, template.id);
  }
  const flow = toMermaid({ title: 'F', description: '', titleAlign: 'center', direction: 'TD', nodes: [{ id: 'a', label: 'A', shape: 'rect', x: 0, y: 0 }], edges: [] });
  assert.equal(readTheme(setTheme(flow, 'forest')), 'forest');
  assert.ok(fromMermaid(setTheme(flow, 'forest')).ok);
  assert.equal(readTheme('flowchart TD\n a-->b\n%% volcanic:{"v":1,"theme":"<script>"}'), '');
});

test('gantt assignees and progress survive a round trip and stay out of the Mermaid lines', () => {
  const diagram = {
    axisFormat: '',
    sections: [
      {
        id: 'g1',
        name: 'Plan',
        tasks: [
          { id: 't1', name: 'Research', status: 'done', critical: false, milestone: false, start: { type: 'date', day: toDay('2026-01-05') }, duration: 5, assignee: 'Martin Tamer', progress: 100 },
          { id: 't2', name: 'Build', status: 'active', critical: false, milestone: false, start: { type: 'after', id: 't1' }, duration: 10, assignee: '', progress: 55 },
          { id: 't3', name: 'Ship', status: 'planned', critical: false, milestone: false, start: { type: 'after', id: 't2' }, duration: 2, assignee: 'Rose', progress: 0 },
          { id: 't4', name: 'Plain', status: 'planned', critical: false, milestone: false, start: { type: 'after', id: 't3' }, duration: 2, assignee: '', progress: 0 },
        ],
      },
    ],
  };
  const text = ganttToMermaid(diagram, { title: 'Plan', description: '' });
  assert.ok(render(text).svg.includes('pele-task'), 'still renders');
  assert.ok(!text.split('\n').slice(0, -1).some((line) => line.includes('Martin')), 'the name is only in the comment');
  const back = ganttFromMermaid(text);
  assert.ok(back.ok, back.reason);
  const tasks = back.diagram.sections[0].tasks;
  assert.deepEqual(tasks.map((t) => [t.assignee, t.progress]), [['Martin Tamer', 100], ['', 55], ['Rose', 0], ['', 0]]);
  // Nothing to record: no comment at all.
  const bare = ganttToMermaid({ ...diagram, sections: [{ ...diagram.sections[0], tasks: [diagram.sections[0].tasks[3]] }] }, { title: 'Plan', description: '' });
  assert.ok(!bare.includes('volcanic:'));
  // Title position and theme sit beside the task details.
  const both = setTheme(setTitleAlign(text, 'left'), 'ocean');
  assert.equal(ganttFromMermaid(both).diagram.sections[0].tasks[0].assignee, 'Martin Tamer');
  assert.equal(readTheme(both), 'ocean');
});

test('public holidays come from the chosen country and region, and are stored in the comment', () => {
  const us = toDay('2025-11-20');
  const christmas = holidaysBetween({ country: 'US', region: '' }, us, toDay('2026-01-10'));
  const names = christmas.map((h) => h.name);
  assert.ok(names.some((n) => /Thanksgiving/i.test(n)), names.join());
  assert.ok(names.some((n) => /Christmas/i.test(n)));
  assert.ok(names.some((n) => /New Year/i.test(n)));
  assert.deepEqual(christmas.map((h) => h.day), [...christmas.map((h) => h.day)].sort((a, b) => a - b));
  // A region adds its own holidays; another country has different ones.
  assert.ok(regionOptions('US').length > 40);
  const de = holidaysBetween({ country: 'DE', region: '' }, us, toDay('2026-01-10')).map((h) => h.name);
  assert.ok(!de.some((n) => /Thanksgiving/i.test(n)));
  assert.ok(countryOptions().some((c) => c.id === 'JP'));
  assert.deepEqual(holidaysBetween({ country: '', region: '' }, us, us + 400), []);
  assert.deepEqual(holidaysBetween({ country: 'ZZ', region: '' }, us, us + 400), []);
  // Stored beside the other details, and bad values are ignored.
  const diagram = { axisFormat: '', holidays: [{ country: 'DE', region: 'BY', include: 0 }], sections: [{ id: 'g1', name: 'A', tasks: [{ id: 't1', name: 'One', status: 'planned', critical: false, milestone: false, start: { type: 'date', day: us }, duration: 3, assignee: '', progress: 0 }] }] };
  const text = ganttToMermaid(diagram, { title: 'T', description: '' });
  assert.deepEqual(ganttFromMermaid(text).diagram.holidays, [{ country: 'DE', region: 'BY', include: 0 }]);
  assert.ok(render(text).svg.includes('pele-task'));
  assert.deepEqual(readHolidayPlaces('gantt\n%% volcanic:{"v":1,"holidays":{"c":"<x>","r":"1"}}'), []);
  // The single-place form older charts used still reads.
  assert.deepEqual(readHolidayPlaces('gantt\n%% volcanic:{"v":1,"holidays":{"c":"US","r":"CA"}}'), [{ country: 'US', region: 'CA', include: 0 }]);
  assert.equal(setHolidayPlaces(text, []).includes('volcanic:'), false);
});

test('Canadian federal holidays, and the option to include bank and optional days', () => {
  const from = toDay('2025-01-01');
  const to = toDay('2025-12-31');
  const federal = holidaysBetween({ country: 'CA', region: 'FED' }, from, to);
  const date = (iso) => federal.find((h) => h.day === toDay(iso))?.name;
  assert.equal(date('2025-11-11'), 'Remembrance Day');
  assert.equal(date('2025-04-18'), 'Good Friday');
  assert.equal(date('2025-05-19'), 'Victoria Day');
  assert.equal(date('2025-09-01'), 'Labour Day');
  assert.equal(date('2025-09-30'), 'National Day for Truth and Reconciliation');
  assert.equal(date('2025-10-13'), 'Thanksgiving Day');
  assert.equal(date('2025-12-26'), 'Boxing Day');
  assert.equal(federal.length, 10);
  assert.ok(regionOptions('CA')[0].id === 'FED');
  // Ontario treats Remembrance Day as optional: it appears once optional days are included.
  const publicOnly = holidaysBetween({ country: 'CA', region: 'ON', include: 0 }, from, to).map((h) => h.name);
  const withOptional = holidaysBetween({ country: 'CA', region: 'ON', include: 1 }, from, to).map((h) => h.name);
  assert.ok(!publicOnly.includes('Remembrance Day'));
  assert.ok(withOptional.includes('Remembrance Day'));
  const withObservances = holidaysBetween({ country: 'CA', region: 'ON', include: 2 }, from, to).map((h) => h.name);
  assert.ok(withObservances.length > withOptional.length);
  // Years: Good Friday moves with Easter.
  const f2026 = holidaysBetween({ country: 'CA', region: 'FED' }, toDay('2026-01-01'), toDay('2026-12-31'));
  assert.equal(f2026.find((h) => h.name === 'Good Friday').day, toDay('2026-04-03'));
  assert.deepEqual(readHolidayPlaces(setHolidayPlaces('gantt', [{ country: 'CA', region: 'ON', include: 1 }])), [{ country: 'CA', region: 'ON', include: 1 }]);
});

test('several countries at once: US, Mexico, Colombia, Peru and Chile', () => {
  const places = ['US', 'MX', 'CO', 'PE', 'CL'].map((country) => ({ country, region: '', include: 0 }));
  const from = toDay('2025-09-01');
  const to = toDay('2025-12-31');
  const found = holidaysForPlaces(places, from, to);
  const byPlace = (name) => found.filter((h) => h.place.startsWith(name)).map((h) => h.name).join(' | ');
  assert.match(byPlace('United States'), /Thanksgiving/);
  assert.match(byPlace('Mexico'), /Independence|Revolution|Guadalupe/i);
  assert.ok(byPlace('Colombia').length > 0);
  assert.ok(byPlace('Peru').length > 0);
  assert.ok(byPlace('Chile').length > 0);
  assert.deepEqual(found.map((h) => h.day), [...found.map((h) => h.day)].sort((a, b) => a - b));
  const groups = groupByPlace(found, places);
  assert.deepEqual(groups.map((g) => g.place.split(' ')[0]), ['United', 'Mexico', 'Colombia', 'Peru', 'Chile']);
  // Christmas Day is a holiday in all five, so that day carries five entries.
  assert.equal(found.filter((h) => h.day === toDay('2025-12-25')).length, 5);
  // Asking twice for the same place does not repeat its holidays.
  assert.equal(holidaysForPlaces([places[0], places[0]], from, to).length, holidaysForPlaces([places[0]], from, to).length);
  // All five survive being stored in the comment.
  const diagram = { axisFormat: '', holidays: places, sections: [{ id: 'g1', name: 'A', tasks: [{ id: 't1', name: 'One', status: 'planned', critical: false, milestone: false, start: { type: 'date', day: from }, duration: 3, assignee: '', progress: 0 }] }] };
  const text = ganttToMermaid(diagram, { title: 'T', description: '' });
  assert.deepEqual(ganttFromMermaid(text).diagram.holidays.map((p) => p.country), ['US', 'MX', 'CO', 'PE', 'CL']);
});

test('countries take colours from their flags, and never share one', () => {
  const choose = (...codes) => codes.map((country) => ({ country, region: '', include: 0 }));
  const slots = (...codes) => Array.from(placeIndexes(choose(...codes)).values());
  // United States blue, Mexico green, Colombia yellow, Peru red, Chile navy (blue is taken).
  assert.deepEqual(slots('US', 'MX', 'CO', 'PE', 'CL'), [1, 2, 3, 4, 8]);
  // A lone country keeps its own colour.
  assert.deepEqual(slots('MX'), [2]);
  // A country whose flag colours are all taken gets the first free colour.
  assert.deepEqual(slots('PE', 'CA'), [4, 0], 'Canada also wants red, so it gets the first free colour');
  // Unlisted countries get free colours.
  const many = slots('US', 'MX', 'CO', 'PE', 'CL', 'XX', 'YY');
  assert.equal(new Set(many).size, many.length);
  // More countries than colours: it still answers, sharing.
  const lots = placeIndexes(choose('US', 'MX', 'CO', 'PE', 'CL', 'GB', 'FR', 'DE', 'ES', 'IT', 'JP', 'IN', 'BR', 'AU'));
  assert.equal(lots.size, 14);
  assert.ok(Array.from(lots.values()).every((n) => n >= 0 && n < 12));
});

test('Tidy up lines shapes of different sizes up by their middles, so a chain stays straight', () => {
  const shapes = ['stadium', 'rounded', 'rect', 'cylinder', 'subroutine', 'circle'];
  const nodes = shapes.map((shape, i) => ({ id: `n${i}`, label: shape, shape, x: i * 37, y: i * 91 }));
  const edges = nodes.slice(1).map((n, i) => ({ id: `e${i}`, from: nodes[i].id, to: n.id, label: '', line: 'solid', arrow: 'arrow' }));
  const centres = (direction) => {
    autoLayout({ title: 'T', description: '', titleAlign: 'center', direction, nodes, edges });
    return nodes.map((n) => {
      const size = estimateSize(n.shape);
      return direction === 'LR' || direction === 'RL' ? n.y + size.h / 2 : n.x + size.w / 2;
    });
  };
  for (const direction of ['LR', 'RL', 'TD', 'BT']) {
    const mid = centres(direction);
    assert.ok(mid.every((c) => Math.abs(c - mid[0]) <= 1), `${direction}: ${mid.join()}`);
  }
  // Layers do not overlap along the flow, and keep their order.
  autoLayout({ title: 'T', description: '', titleAlign: 'center', direction: 'LR', nodes, edges });
  for (let i = 1; i < nodes.length; i++) assert.ok(nodes[i].x >= nodes[i - 1].x + estimateSize(nodes[i - 1].shape).w, `n${i} clears n${i - 1}`);
  // Real sizes win over the estimates.
  autoLayout({ title: 'T', description: '', titleAlign: 'center', direction: 'LR', nodes, edges }, () => ({ w: 300, h: 100 }));
  assert.ok(nodes[1].x - nodes[0].x >= 300);
  // A branch spreads across the flow around the same middle line.
  const branch = [
    { id: 'a', label: 'a', shape: 'rect', x: 0, y: 0 },
    { id: 'b', label: 'b', shape: 'rect', x: 0, y: 0 },
    { id: 'c', label: 'c', shape: 'rect', x: 0, y: 0 },
  ];
  autoLayout({ title: 'T', description: '', titleAlign: 'center', direction: 'LR', nodes: branch, edges: [{ id: '1', from: 'a', to: 'b', label: '', line: 'solid', arrow: 'arrow' }, { id: '2', from: 'a', to: 'c', label: '', line: 'solid', arrow: 'arrow' }] });
  const mid = (branch[1].y + branch[2].y + 48) / 2;
  assert.ok(Math.abs(mid - (branch[0].y + 24)) <= 1, 'the parent sits between its two children');
});

test('text size is stored in the comment and makes Pele draw larger or smaller text', () => {
  for (const template of TEMPLATES) {
    const titled = setTitle(template.source, 'T');
    const sized = setFontSize(setTheme(setTitleAlign(titled, 'left'), 'ocean'), 24);
    assert.equal(readFontSize(sized), 24, template.id);
    assert.equal(readTheme(sized), 'ocean', template.id);
    assert.equal(readTitleAlign(sized), 'left', template.id);
    assert.equal(setFontSize(sized, 0).includes('"fs"'), false, template.id);
    assert.equal(setFontSize(titled, 0), titled, template.id);
  }
  assert.equal(readFontSize('gantt\n%% volcanic:{"v":1,"fs":999}'), 0);
  assert.equal(readFontSize('gantt\n%% volcanic:{"v":1,"fs":"big"}'), 0);
  assert.ok(TEXT_SIZES.every((s) => s.id === '' || Number(s.id) >= 8));
  // Pele lays the diagram out for the size it is given: bigger text, bigger picture.
  const source = 'flowchart LR\n a([Start]) --> b{Why?}';
  const small = render(source, { fontSize: 12 });
  const large = render(source, { fontSize: 28 });
  assert.ok(large.width > small.width && large.height > small.height, `${small.width}x${small.height} vs ${large.width}x${large.height}`);
});

test('mind maps round trip, keep tricky text safe, and refuse what the editor cannot hold', () => {
  const map = starterMindMap();
  map.root.children[0].text = 'Plan (v2) [draft]: a; b # c "quoted"';
  map.root.children[0].children.push({ id: 'x1', text: 'Two\nlines', shape: 'default', children: [] });
  map.root.children[1].shape = 'cloud';
  map.root.children[1].text = 'Say "hi" (really)';
  map.root.children[2].shape = 'hexagon';
  const text = mindToMermaid(map, { title: 'T', description: 'About the map' });
  assert.ok(render(text).svg.length > 100, 'Pele draws it');
  const back = mindFromMermaid(text);
  assert.ok(back.ok, back.reason);
  const texts = flatten(back.map).map((r) => [r.node.text, r.node.shape, r.depth]);
  assert.deepEqual(texts, [
    ['Main idea', 'circle', 0],
    ['Plan (v2) [draft]: a; b # c "quoted"', 'default', 1],
    ['Two\nlines', 'default', 2],
    ['Say "hi" (really)', 'cloud', 1],
    ['Third branch', 'hexagon', 1],
  ]);
  assert.equal(back.title, 'T');
  assert.equal(back.description, 'About the map');
  // No accTitle or accDescr lines: Pele's mind map rejects them.
  assert.ok(!/accTitle|accDescr/.test(text));
  assert.equal(readDescription(text), 'About the map');
  // Refusals: icons, classes, a second top-level idea.
  assert.equal(mindFromMermaid('mindmap\n  root\n    A::icon(fa fa-book)').ok, false);
  assert.equal(mindFromMermaid('mindmap\n  root\n    A:::urgent').ok, false);
  assert.equal(mindFromMermaid('mindmap\n  root\n    A\n  other').ok, false);
  assert.equal(mindFromMermaid('flowchart TD\n a-->b').ok, false);
  // Hand-written maps in their own style import, tabs and uneven indents included.
  const hand = mindFromMermaid('mindmap\n\troot((Plan))\n\t\tA\n\t\t\tB\n\t\tC[Square]\n\t\tD(Round)');
  assert.ok(hand.ok, hand.reason);
  assert.deepEqual(flatten(hand.map).map((r) => `${r.depth}:${r.node.text}:${r.node.shape}`), ['0:Plan:circle', '1:A:default', '2:B:default', '1:Square:square', '1:Round:rounded']);
  // Every template and sample the editor offers loads.
  const template = TEMPLATES.find((x) => x.id === 'mindmap');
  assert.ok(mindFromMermaid(template.source).ok, mindFromMermaid(template.source).reason);
});

test('moving ideas around the mind map tree', () => {
  const build = () => ({ root: { id: 'r', text: 'R', shape: 'default', children: [
    { id: 'a', text: 'A', shape: 'default', children: [{ id: 'a1', text: 'A1', shape: 'default', children: [] }, { id: 'a2', text: 'A2', shape: 'default', children: [] }] },
    { id: 'b', text: 'B', shape: 'default', children: [] },
    { id: 'c', text: 'C', shape: 'default', children: [] },
  ] } });
  const shape = (m) => flatten(m).map((x) => `${x.depth}${x.node.id}`).join(' ');
  let m = build();
  assert.equal(shape(m), '0r 1a 2a1 2a2 1b 1c');
  // Into another idea, as its last child.
  assert.ok(moveNode(m, 'b', findNode(m, 'a'), findNode(m, 'a').children.length));
  assert.equal(shape(m), '0r 1a 2a1 2a2 2b 1c');
  // Within one list: positions count before the idea is lifted out.
  m = build();
  assert.ok(moveNode(m, 'c', m.root, 0));
  assert.equal(shape(m), '0r 1c 1a 2a1 2a2 1b');
  m = build();
  assert.ok(moveNode(m, 'a', m.root, 2));
  assert.equal(shape(m), '0r 1b 1a 2a1 2a2 1c');
  m = build();
  assert.ok(moveNode(m, 'a', m.root, 3));
  assert.equal(shape(m), '0r 1b 1c 1a 2a1 2a2');
  // An idea cannot go inside itself or what it holds, and the root cannot move.
  m = build();
  assert.equal(moveNode(m, 'a', findNode(m, 'a1'), 0), false);
  assert.equal(moveNode(m, 'a', findNode(m, 'a'), 0), false);
  assert.equal(moveNode(m, 'r', findNode(m, 'b'), 0), false);
  assert.equal(shape(m), '0r 1a 2a1 2a2 1b 1c');
  assert.equal(countNodes(findNode(m, 'a')), 3);
  assert.equal(parentOf(m, 'a1').id, 'a');
});

test('user journeys round trip, keep tricky names safe, and refuse bad scores', () => {
  const j = starterJourney();
  j.sections[0].steps[0].text = 'Say hi: hello, world';
  j.sections[0].steps[0].actors = ['Me, myself', 'Cat'];
  j.sections[0].steps[1].actors = [];
  const text = journeyToMermaid(j, { title: 'My day', description: 'How it goes' });
  assert.ok(render(text).svg.length > 100, 'Pele draws it');
  assert.ok(/accTitle: My day/.test(text) && /accDescr: How it goes/.test(text));
  const back = journeyFromMermaid(text);
  assert.ok(back.ok, back.reason);
  assert.deepEqual(back.journey.sections.map((s) => s.name), ['Getting started', 'Getting it done']);
  const steps = allJourneySteps(back.journey).map((x) => [x.step.text, x.step.score, x.step.actors.join('|')]);
  assert.deepEqual(steps, [['Say hi: hello, world', 4, 'Me, myself|Cat'], ['A harder step', 2, ''], ['The result', 5, 'Me']]);
  assert.equal(back.title, 'My day');
  assert.equal(back.description, 'How it goes');
  // Refusals and tolerance.
  assert.equal(journeyFromMermaid('journey\n  section A\n    X: 0: Me').ok, false);
  assert.equal(journeyFromMermaid('journey\n  section A\n    X: 6: Me').ok, false);
  assert.equal(journeyFromMermaid('flowchart TD\n a-->b').ok, false);
  const hand = journeyFromMermaid('journey\n  title Inline\n  Make tea: 5\n  section B\n    Work: 3: Me, Cat, Me');
  assert.ok(hand.ok, hand.reason);
  assert.equal(hand.title, 'Inline');
  assert.deepEqual(hand.journey.sections.map((s) => [s.name, s.steps.length]), [['', 1], ['B', 1]]);
  assert.deepEqual(hand.journey.sections[1].steps[0].actors, ['Me', 'Cat']);
  // Sorted the way Pele sorts them, so colours match its picture.
  assert.deepEqual(actorsOf(back.journey), ['Cat', 'Me', 'Me, myself']);
  assert.deepEqual(actorsOf({ sections: [{ id: 'a', name: '', steps: [{ id: '1', text: 'x', score: 3, actors: ['zed', 'alice', 'Bob', 'Émile'] }] }] }), ['Bob', 'alice', 'zed', 'Émile']);
  assert.ok(journeyFromMermaid(TEMPLATES.find((x) => x.id === 'journey')?.source ?? 'journey\n  section A\n    X: 3: Me').ok);
});

test('moving steps around a journey, across sections', () => {
  const build = () => ({ sections: [
    { id: 'a', name: 'A', steps: [{ id: '1', text: '1', score: 3, actors: [] }, { id: '2', text: '2', score: 3, actors: [] }, { id: '3', text: '3', score: 3, actors: [] }] },
    { id: 'b', name: 'B', steps: [{ id: '4', text: '4', score: 3, actors: [] }] },
    { id: 'c', name: 'C', steps: [] },
  ] });
  const shape = (j) => j.sections.map((s) => s.steps.map((x) => x.id).join('')).join('|');
  let j = build();
  assert.equal(shape(j), '123|4|');
  assert.ok(moveJourneyStep(j, '1', 0, 3));
  assert.equal(shape(j), '231|4|');
  j = build();
  assert.ok(moveJourneyStep(j, '3', 0, 0));
  assert.equal(shape(j), '312|4|');
  j = build();
  assert.ok(moveJourneyStep(j, '2', 1, 0));
  assert.equal(shape(j), '13|24|');
  j = build();
  assert.ok(moveJourneyStep(j, '4', 2, 0));
  assert.equal(shape(j), '123||4');
  assert.equal(moveJourneyStep(j, 'nope', 0, 0), false);
});

test('pie charts round trip, keep quotes safe, and refuse what they cannot hold', () => {
  const pie = starterPie();
  pie.slices.push({ id: 'x', label: 'Say "hi": ok', value: 2.5 });
  pie.showData = true;
  const text = pieToMermaid(pie, { title: 'Time', description: 'Where it goes' });
  assert.match(text, /^---\ntitle: "Time"\n---\npie showData/);
  const back = pieFromMermaid(text);
  assert.ok(back.ok);
  assert.equal(back.title, 'Time');
  assert.equal(back.description, 'Where it goes');
  assert.equal(back.pie.showData, true);
  assert.deepEqual(back.pie.slices.map((s) => [s.label, s.value]), pie.slices.map((s) => [s.label, s.value]));
  const hand = pieFromMermaid('pie showData title Fruit\n  "A" : 40\n  "B" : 0');
  assert.ok(hand.ok);
  assert.equal(hand.title, 'Fruit');
  assert.equal(hand.pie.slices[1].value, 0);
  assert.equal(pieFromMermaid('pie\n  "A" : -3').ok, false);
  assert.equal(pieFromMermaid('pie\n  A : 3').ok, false);
  assert.equal(pieFromMermaid('flowchart TD\n a-->b').ok, false);
  assert.equal(percentOf(1, 4), '25%');
  assert.equal(percentOf(1, 0), '0%');
  assert.ok(pieFromMermaid(TEMPLATES.find((x) => x.id === 'pie').source).ok);
});

test('radar charts round trip, keep quotes safe, and refuse what they cannot hold', () => {
  const radar = starterRadar();
  radar.axes[0].label = 'Say "hi"';
  radar.options = { showLegend: false, ticks: 3, max: 8, min: 1, graticule: 'polygon' };
  const text = radarToMermaid(radar, { title: 'Skills', description: 'Who is good at what' });
  assert.match(text, /^---\ntitle: "Skills"\n---\nradar-beta/);
  const back = radarFromMermaid(text);
  assert.equal(back.ok, true);
  assert.equal(back.title, 'Skills');
  assert.equal(back.description, 'Who is good at what');
  assert.deepEqual(back.radar.axes.map((a) => a.label), radar.axes.map((a) => a.label));
  assert.deepEqual(back.radar.series.map((s) => back.radar.axes.map((a) => s.values[a.id])), [[4, 3, 2, 5, 1], [2, 5, 4, 1, 3]]);
  assert.deepEqual(back.radar.options, radar.options);
  const keyed = radarFromMermaid('radar-beta\n  axis a["A"], b["B"], c\n  curve x["X"]{b: 2, a: 1, c: 3}');
  assert.equal(keyed.ok, true);
  assert.deepEqual(keyed.radar.series[0].values, { b: 2, a: 1, c: 3 });
  assert.equal(keyed.radar.axes[2].label, 'c');
  assert.equal(radarFromMermaid('radar-beta\n  axis a, b, c\n  curve x{1, 2, 3, 4}').ok, false);
  assert.equal(radarFromMermaid('radar-beta\n  axis a, b, c\n  curve x{1, 2, 3}\n  curve y{1,2,3}\n  ticks 99').ok, false);
  assert.equal(radarFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(radarFromMermaid(TEMPLATES.find((x) => x.id === 'radar').source).ok);
  assert.equal(radarToMermaid({ axes: [], series: radar.series, options: radar.options }, { title: '', description: '' }), '');
});

test('quadrant charts round trip, keep names safe, and refuse what they cannot hold', () => {
  const q = starterQuadrant();
  q.points[0].label = 'Say: "hi" [now]';
  q.xRight = '';
  q.names[3] = '';
  const text = quadrantToMermaid(q, { title: 'Ideas', description: 'By effort' });
  assert.match(text, /^---\ntitle: "Ideas"\n---\nquadrantChart/);
  assert.doesNotMatch(text, /quadrant-4/);
  const back = quadrantFromMermaid(text);
  assert.equal(back.ok, true);
  assert.equal(back.title, 'Ideas');
  assert.equal(back.quadrant.xLeft, 'Low effort');
  assert.equal(back.quadrant.xRight, '');
  assert.deepEqual(back.quadrant.names, ['Plan', 'Do first', 'Drop', '']);
  assert.deepEqual(back.quadrant.points.map((p) => [p.label, p.x, p.y]), q.points.map((p) => [p.label.replace(/"/g, "'"), p.x, p.y]));
  assert.equal(quadrantFromMermaid('quadrantChart\n  A: [0.5, 0.5] radius: 5').ok, false);
  assert.equal(quadrantFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(quadrantFromMermaid(TEMPLATES.find((x) => x.id === 'quadrant').source).ok);
  assert.equal(quadrantToMermaid({ ...q, points: [] }, { title: '', description: '' }), '');
});

test('timelines round trip, keep colons safe, and move periods across sections', () => {
  const t = starterTimeline();
  t.sections[0].periods[0].events[0].text = 'Kick-off: day one';
  t.sections.push({ id: 's20', name: 'Later', periods: [{ id: 'p21', label: 'Q1', events: [] }] });
  const text = timelineToMermaid(t, { title: 'History', description: 'How it grew' });
  assert.match(text, /^---\ntitle: "History"\n---\ntimeline/);
  const back = timelineFromMermaid(text);
  assert.equal(back.ok, true);
  assert.equal(back.title, 'History');
  assert.deepEqual(back.timeline.sections.map((s) => s.name), ['', 'Later']);
  assert.deepEqual(back.timeline.sections[0].periods.map((p) => [p.label, p.events.map((e) => e.text)]), [['2022', ['Kick-off: day one']], ['2024', ['Prototype', 'First users']], ['2026', ['Release']]]);
  assert.deepEqual(back.timeline.sections[1].periods.map((p) => [p.label, p.events.length]), [['Q1', 0]]);
  const more = timelineFromMermaid('timeline\n  2002 : A\n       : B\n  2004 : C');
  assert.equal(more.ok, true);
  assert.deepEqual(more.timeline.sections[0].periods.map((p) => p.events.map((e) => e.text)), [['A', 'B'], ['C']]);
  assert.equal(timelineFromMermaid('timeline\n  direction TD\n  2002 : A').ok, false);
  assert.equal(timelineFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(timelineFromMermaid(TEMPLATES.find((x) => x.id === 'timeline').source).ok);
  // The last period of a section moves into the next section, and the first period cannot go earlier.
  const moving = JSON.parse(JSON.stringify(back.timeline));
  const last = moving.sections[0].periods[2].id;
  assert.equal(shiftPeriod(moving, last, 1), true);
  assert.equal(moving.sections[1].periods[0].id, last);
  assert.equal(shiftPeriod(moving, moving.sections[0].periods[0].id, -1), false);
  assert.equal(timelineToMermaid({ sections: [] }, { title: '', description: '' }), '');
});

test('XY charts round trip, keep names safe, and refuse what they cannot hold', () => {
  const c = starterXyChart();
  c.horizontal = true;
  c.xTitle = 'Month';
  c.categories[0].label = 'First, "best" month';
  c.series[1].label = '';
  c.series[0].values[c.categories[1].id] = -2.5;
  const text = xyChartToMermaid(c, { title: 'Sales', description: 'Revenue' });
  assert.match(text, /^---\ntitle: "Sales"\n---\nxychart-beta horizontal/);
  const back = xyChartFromMermaid(text);
  assert.equal(back.ok, true);
  assert.equal(back.title, 'Sales');
  assert.equal(back.chart.horizontal, true);
  assert.equal(back.chart.xTitle, 'Month');
  assert.equal(back.chart.yTitle, 'Revenue');
  assert.deepEqual([back.chart.yMin, back.chart.yMax], [0, 100]);
  assert.deepEqual(back.chart.categories.map((x) => x.label), ["First, 'best' month", 'Feb', 'Mar', 'Apr', 'May']);
  assert.deepEqual(back.chart.series.map((s) => [s.kind, s.label]), [['bar', 'Revenue'], ['line', '']]);
  assert.deepEqual(back.chart.series[0].values && back.chart.categories.map((x) => back.chart.series[0].values[x.id]), [30, -2.5, 80, 60, 90]);
  assert.equal(xyChartFromMermaid('xychart-beta\n  x-axis 0 --> 10\n  line [1, 2, 3]').ok, false);
  assert.equal(xyChartFromMermaid('xychart-beta\n  x-axis [a, b, c]\n  line [1, 2]').ok, false);
  assert.equal(xyChartFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(xyChartFromMermaid(TEMPLATES.find((x) => x.id === 'xychart').source).ok);
  assert.equal(xyChartToMermaid({ ...c, series: [] }, { title: '', description: '' }), '');
  const open = xyChartFromMermaid('xychart-beta\n  x-axis [a, b]\n  y-axis "Rev"\n  bar [1, 2]');
  assert.equal(open.ok, true);
  assert.deepEqual([open.chart.yTitle, open.chart.yMin, open.chart.yMax], ['Rev', null, null]);
});

test('kanban boards round trip, keep card text safe, and move cards between columns', () => {
  const k = starterKanban();
  k.columns[0].cards[0].text = 'Say "hi" (now) [soon]: ok';
  k.columns[0].cards[0].assigned = "Ann O'Brien";
  k.columns[0].cards[0].ticket = 'ABC-1';
  k.columns[0].cards[0].priority = 'Very High';
  k.columns.push({ id: 'c20', name: 'Empty', cards: [] });
  const text = kanbanToMermaid(k, { title: 'Board', description: 'My work' });
  assert.match(text, /^---\ntitle: "Board"\n---\nkanban\n/);
  assert.doesNotMatch(text, /accTitle|accDescr/);
  const back = kanbanFromMermaid(text);
  assert.equal(back.ok, true);
  assert.equal(back.title, 'Board');
  assert.equal(back.description, 'My work');
  assert.deepEqual(back.kanban.columns.map((c) => [c.name, c.cards.length]), [['To do', 2], ['In progress', 1], ['Done', 1], ['Empty', 0]]);
  const first = back.kanban.columns[0].cards[0];
  assert.deepEqual([first.text, first.assigned, first.ticket, first.priority], ['Say "hi" (now) [soon]: ok', 'Ann O’Brien', 'ABC-1', 'Very High']);
  assert.equal(kanbanFromMermaid('kanban\n  a[A]\n    b[B]@{ icon: \'x\' }').ok, false);
  assert.equal(kanbanFromMermaid('kanban\n  a[A]\n    b[B]@{ priority: \'Urgent\' }').ok, false);
  assert.equal(kanbanFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(kanbanFromMermaid(TEMPLATES.find((x) => x.id === 'kanban').source).ok);
  const moving = JSON.parse(JSON.stringify(back.kanban));
  const id = moving.columns[0].cards[1].id;
  assert.equal(moveKanbanCard(moving, id, 1, 0), true);
  assert.deepEqual(moving.columns.map((c) => c.cards.length), [1, 2, 1, 0]);
  assert.equal(moving.columns[1].cards[0].id, id);
  assert.equal(kanbanToMermaid({ columns: [] }, { title: '', description: '' }), '');
});

test('Sankey diagrams round trip, keep commas and quotes safe, and spot loops', () => {
  const k = starterSankey();
  k.flows[0].target = 'Home, sweet "home"';
  k.flows[2].source = 'Home, sweet "home"';
  k.flows.push({ id: 'x', source: '', target: 'Lost', value: 3 });
  const text = sankeyToMermaid(k, { title: 'Energy', description: 'Where it goes' });
  assert.match(text, /^---\ntitle: "Energy"\n---\nsankey-beta\n/);
  assert.doesNotMatch(text, /Lost/);
  const back = sankeyFromMermaid(text);
  assert.equal(back.ok, true);
  assert.equal(back.title, 'Energy');
  assert.equal(back.description, 'Where it goes');
  assert.deepEqual(back.sankey.flows.map((f) => [f.source, f.target, f.value]), k.flows.slice(0, 6).map((f) => [f.source, f.target, f.value]));
  const energy = totalsOf(back.sankey).find((n) => n.name === 'Energy');
  assert.deepEqual([energy.into, energy.out], [0, 100]);
  assert.deepEqual(loopsIn(k), []);
  assert.deepEqual(loopsIn({ flows: [{ id: 'a', source: 'A', target: 'B', value: 1 }, { id: 'b', source: 'B', target: 'A', value: 1 }] }).sort(), ['A']);
  assert.equal(sankeyFromMermaid('sankey-beta\nA,B').ok, false);
  assert.equal(sankeyFromMermaid('sankey-beta\nA,B,-1').ok, false);
  assert.equal(sankeyFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(sankeyFromMermaid(TEMPLATES.find((x) => x.id === 'sankey').source).ok);
  assert.equal(sankeyToMermaid({ flows: [] }, { title: '', description: '' }), '');
});

test('treemaps round trip, keep names safe, add up their contents and re-nest', () => {
  const t = starterTreemap();
  t.roots[0].children[0].name = 'R&D "labs"';
  const text = treemapToMermaid(t, { title: 'Company', description: 'Where the people are' });
  assert.match(text, /^---\ntitle: "Company"\n---\ntreemap-beta\n/);
  const back = treemapFromMermaid(text);
  assert.equal(back.ok, true);
  assert.equal(back.title, 'Company');
  assert.equal(back.description, 'Where the people are');
  assert.deepEqual(flattenTree(back.treemap).map((p) => [p.depth, p.node.name, p.node.children.length ? null : p.node.value]), [[0, 'Company', null], [1, "R&D 'labs'", 40], [1, 'Sales', null], [2, 'Europe', 10], [2, 'Americas', 15], [1, 'Support', 15], [1, 'Design', 12]]);
  assert.equal(sizeOf(back.treemap.roots[0]), 92);
  // Re-nesting: Support goes inside Sales, then comes back out after it; the first box cannot go inside anything.
  const moving = JSON.parse(JSON.stringify(back.treemap));
  const ids = Object.fromEntries(flattenTree(moving).map((p) => [p.node.name, p.node.id]));
  assert.equal(indentNode(moving, ids['Support']), true);
  assert.equal(sizeOf(moving.roots[0].children[1]), 40);
  assert.equal(outdentNode(moving, ids['Support']), true);
  assert.equal(shiftNode(moving, ids['Support'], -1), true);
  assert.equal(indentNode(moving, ids["R&D 'labs'"]), false);
  assert.equal(treemapFromMermaid('treemap-beta\n"A": 10\n  "B": 1').ok, false);
  assert.equal(treemapFromMermaid('treemap-beta\n"A"\n  "B": -2').ok, false);
  assert.equal(treemapFromMermaid('treemap-beta\n"A"\n  "B": 1:::cls').ok, false);
  assert.equal(treemapFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(treemapFromMermaid(TEMPLATES.find((x) => x.id === 'treemap').source).ok);
  assert.equal(treemapToMermaid({ roots: [] }, { title: '', description: '' }), '');
});
