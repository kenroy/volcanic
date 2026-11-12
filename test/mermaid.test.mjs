// Round-trip tests for the Mermaid generator/importer, bundled on the fly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import { render } from 'pele';

const bundle = await esbuild.build({ entryPoints: ['src/all.ts'], bundle: true, format: 'esm', write: false, platform: 'node' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const { toMermaid, fromMermaid, stripMeta, readTitle, setTitle, readTitleAlign, setTitleAlign, TEMPLATES, seqToMermaid, seqFromMermaid, ganttToMermaid, ganttFromMermaid, resolveSpans, toDay, toIso, THEMES, contrast, readTheme, setTheme, holidaysBetween, countryOptions, regionOptions, readHolidayPlaces, setHolidayPlaces, holidaysForPlaces, groupByPlace, placeIndexes, autoLayout, estimateSize, readFontSize, setFontSize, TEXT_SIZES, mindToMermaid, mindFromMermaid, moveNode, findNode, parentOf, flatten, starterMindMap, countNodes, readDescription, journeyToMermaid, journeyFromMermaid, moveStep: moveJourneyStep, starterJourney, allSteps: allJourneySteps, actorsOf, pieToMermaid, pieFromMermaid, starterPie, percentOf, radarToMermaid, radarFromMermaid, starterRadar, quadrantToMermaid, quadrantFromMermaid, starterQuadrant, timelineToMermaid, timelineFromMermaid, starterTimeline, shiftPeriod, xyChartToMermaid, xyChartFromMermaid, starterXyChart, kanbanToMermaid, kanbanFromMermaid, starterKanban, moveCard: moveKanbanCard, sankeyToMermaid, sankeyFromMermaid, starterSankey, loopsIn, totalsOf, treemapToMermaid, treemapFromMermaid, starterTreemap, sizeOf, indentNode, outdentNode, shiftNode, flattenTree, packetToMermaid, packetFromMermaid, starterPacket, placeFields, totalBits, stateToMermaid, stateFromMermaid, starterState, START, END, loose, duplicateNames, erToMermaid, erFromMermaid, starterEr, unconnected, classToMermaid, classFromMermaid, starterClasses, unrelated, duplicateClasses, architectureToMermaid, architectureFromMermaid, starterArchitecture, unconnectedElements, blockToMermaid, blockFromMermaid, starterBlocks, placeBlocks, tooWide, gitToMermaid, gitFromMermaid, starterGit, branchNames, branchAfter, gitProblem, blankStep, requirementToMermaid, requirementFromMermaid, starterRequirements, untraced, duplicateItems, blankItem } = mod;

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

test('packet diagrams round trip, work out the bits each field covers, and refuse what they cannot hold', () => {
  const p = starterPacket();
  p.fields[0].label = 'Say "hi"';
  p.fields.push({ id: 'x', label: 'Flag', bits: 1 });
  const text = packetToMermaid(p, { title: 'TCP', description: 'First fields' });
  assert.match(text, /^---\ntitle: "TCP"\n---\npacket-beta/);
  assert.match(text, /    0-15: "Say 'hi'"/);
  assert.match(text, /    96: "Flag"/);
  const back = packetFromMermaid(text);
  assert.equal(back.ok, true);
  assert.equal(back.title, 'TCP');
  assert.equal(back.description, 'First fields');
  assert.deepEqual(back.packet.fields.map((f) => [f.label, f.bits]), [["Say 'hi'", 16], ['Destination port', 16], ['Sequence number', 32], ['Acknowledgment number', 32], ['Flag', 1]]);
  assert.deepEqual(placeFields(back.packet).map((f) => [f.start, f.end]), [[0, 15], [16, 31], [32, 63], [64, 95], [96, 96]]);
  assert.equal(totalBits(back.packet), 97);
  // Moving a field along shifts the bits of those it passes.
  const moved = JSON.parse(JSON.stringify(back.packet));
  moved.fields.unshift(moved.fields.pop());
  assert.deepEqual(placeFields(moved).slice(0, 2).map((f) => [f.start, f.end]), [[0, 0], [1, 16]]);
  const relative = packetFromMermaid('packet-beta\n  +8: "A"\n  +8: "B"');
  assert.equal(relative.ok, true);
  assert.deepEqual(relative.packet.fields.map((f) => f.bits), [8, 8]);
  assert.equal(packetFromMermaid('packet-beta\n  0-7: "A"\n  9-15: "gap"').ok, false);
  assert.equal(packetFromMermaid('packet-beta\n  4-7: "starts late"').ok, false);
  assert.equal(packetFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(packetFromMermaid(TEMPLATES.find((x) => x.id === 'packet').source).ok);
  assert.equal(packetToMermaid({ fields: [] }, { title: '', description: '' }), '');
});

test('state diagrams round trip, keep names safe, and refuse what they cannot hold', () => {
  const d = starterState();
  d.direction = 'LR';
  d.states[1].name = 'Say "hi"';
  d.states.push({ id: 's4', name: 'Waiting for input' }, { id: 's5', name: 'Lonely' }, { id: 's6', name: 'end' });
  d.transitions.push({ id: 't7', from: 's4', to: 's6', label: 'a: b; c' });
  const text = stateToMermaid(d, { title: 'Player', description: 'How it moves' });
  assert.match(text, /^---\ntitle: "Player"\n---\nstateDiagram-v2/);
  assert.match(text, /    direction LR/);
  assert.match(text, /    state "Say 'hi'" as s1/);
  assert.match(text, /    \[\*\] --> Idle/);
  assert.match(text, /    Running --> \[\*\]: crash|    s1 --> \[\*\]: crash/);
  assert.match(text, /\n    Lonely\n/);
  const back = stateFromMermaid(text);
  assert.equal(back.ok, true, back.reason);
  assert.equal(back.title, 'Player');
  assert.equal(back.description, 'How it moves');
  assert.equal(back.diagram.direction, 'LR');
  assert.deepEqual(back.diagram.states.map((s) => s.name), ["Idle", "Say 'hi'", 'Paused', 'Waiting for input', 'Lonely', 'end']);
  const name = (id) => (id === START ? 'START' : id === END ? 'END' : back.diagram.states.find((s) => s.id === id).name);
  assert.deepEqual(back.diagram.transitions.map((t) => [name(t.from), name(t.to), t.label]).slice(0, 2), [['START', 'Idle', ''], ['Idle', "Say 'hi'", 'start']]);
  assert.equal(back.diagram.transitions.at(-1).label, 'a: b; c');
  assert.equal(back.diagram.transitions.length, d.transitions.length);
  // A second pass changes nothing.
  assert.equal(stateToMermaid(back.diagram, { title: 'Player', description: 'How it moves' }), text);
  const described = stateFromMermaid('stateDiagram-v2\n  state "Two words" as a\n  b : Described\n  [*] --> a\n  a --> b: go');
  assert.equal(described.ok, true);
  assert.deepEqual(described.diagram.states.map((s) => s.name), ['Two words', 'Described']);
  assert.equal(stateFromMermaid('stateDiagram\n  A --> B').ok, true);
  assert.equal(stateFromMermaid('stateDiagram-v2\n  state C {\n    [*] --> X\n  }').ok, false);
  assert.equal(stateFromMermaid('stateDiagram-v2\n  state F <<fork>>\n  A --> F').ok, false);
  assert.equal(stateFromMermaid('stateDiagram-v2\n  A --> B\n  note right of A : hi').ok, false);
  assert.equal(stateFromMermaid('stateDiagram-v2\n  A: one\n  A: two').ok, false);
  assert.equal(stateFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(stateFromMermaid(TEMPLATES.find((x) => x.id === 'state').source).ok);
  assert.equal(stateToMermaid({ states: [], transitions: [], direction: 'TB' }, { title: '', description: '' }), '');
  // Notes about loose ends.
  const l = loose(back.diagram);
  assert.deepEqual(l.alone.map((s) => s.name), ['Lonely']);
  assert.deepEqual(duplicateNames({ states: [{ id: 'a', name: 'X' }, { id: 'b', name: ' x ' }], transitions: [], direction: 'TB' }), [' x '.trim()]);
});

test('entity relationship diagrams round trip, keep names safe, and refuse what they cannot hold', () => {
  const d = starterEr();
  d.direction = 'LR';
  d.entities[0].name = 'Line item';
  d.entities[0].attributes[1].type = 'varchar(20)';
  d.entities[0].attributes[1].comment = 'a "quoted"; note';
  d.entities.push({ id: 'e9', name: 'Lonely', attributes: [] });
  d.relationships[1].identifying = false;
  d.relationships[1].cardA = 'zeroOne';
  const text = erToMermaid(d, { title: 'Shop', description: 'Things' });
  assert.match(text, /^---\ntitle: "Shop"\n---\nerDiagram/);
  assert.match(text, /    direction LR/);
  assert.match(text, /"Line item" \{/);
  assert.match(text, /        int id PK/);
  assert.match(text, /"Line item" \|\|--o\{ ORDER : "places"/);
  assert.match(text, /ORDER \|o\.\.\|\{ PRODUCT : "contains"/);
  const back = erFromMermaid(text);
  assert.equal(back.ok, true, back.reason);
  assert.equal(back.title, 'Shop');
  assert.equal(back.diagram.direction, 'LR');
  assert.deepEqual(back.diagram.entities.map((e) => e.name), ['Line item', 'ORDER', 'PRODUCT', 'Lonely']);
  assert.equal(back.diagram.entities[0].attributes[1].type, 'varchar(20)');
  assert.equal(back.diagram.entities[0].attributes[1].comment, "a 'quoted'; note");
  assert.deepEqual(back.diagram.relationships.map((r) => [r.cardA, r.cardB, r.identifying, r.label]), [['one', 'zeroMany', true, 'places'], ['zeroOne', 'oneMany', false, 'contains']]);
  assert.equal(erToMermaid(back.diagram, { title: 'Shop', description: 'Things' }), text);
  assert.deepEqual(unconnected(back.diagram).map((e) => e.name), ['Lonely']);
  const loose = erFromMermaid('erDiagram\n  A ||--o{ B : places order\n  A {\n    string x PK\n  }');
  assert.equal(loose.ok, true);
  assert.equal(loose.diagram.relationships[0].label, 'places order');
  assert.equal(erFromMermaid('erDiagram\n  A {\n    int x PK, FK\n  }').ok, false);
  assert.equal(erFromMermaid('erDiagram\n  p[Person] {\n    int x\n  }').ok, false);
  assert.equal(erFromMermaid('erDiagram\n  A:::foo ||--o{ B : x').ok, false);
  assert.equal(erFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(erFromMermaid(TEMPLATES.find((x) => x.id === 'er').source).ok);
  assert.equal(erToMermaid({ entities: [], relationships: [], direction: 'TB' }, { title: '', description: '' }), '');
});

test('class diagrams round trip, keep each relationship pointing the right way, and refuse what they cannot hold', () => {
  const d = starterClasses();
  d.direction = 'LR';
  d.classes[0].stereotype = 'interface';
  d.classes[1].name = 'Guide dog';
  d.classes[1].members[0].text = 'fetch(int times): bool; ok';
  d.classes.push({ id: 'c9', name: 'Owner', stereotype: '', members: [] });
  d.relations.push({ id: 'r9', from: 'c9', to: 'c1', kind: 'aggregates', label: 'has', fromCount: '1', toCount: '0..*' });
  d.relations.push({ id: 'r10', from: 'c2', to: 'c9', kind: 'uses', label: '', fromCount: '', toCount: '1' });
  const text = classToMermaid(d, { title: 'Pets', description: 'Animals' });
  assert.match(text, /^---\ntitle: "Pets"\n---\nclassDiagram/);
  assert.match(text, /    direction LR/);
  assert.match(text, /    class C1\["Guide dog"\] \{/);
  assert.match(text, /        <<interface>>/);
  assert.match(text, /    Animal <\|-- C1/);
  assert.match(text, /    Owner "1" o-- "0\.\.\*" Animal : has/);
  assert.match(text, /    C1 --> "1" Owner/);
  const back = classFromMermaid(text);
  assert.equal(back.ok, true, back.reason);
  assert.equal(back.title, 'Pets');
  assert.equal(back.diagram.direction, 'LR');
  assert.deepEqual(back.diagram.classes.map((c) => [c.name, c.stereotype]), [['Animal', 'interface'], ['Guide dog', ''], ['Cat', ''], ['Owner', '']]);
  assert.equal(back.diagram.classes[1].members[0].text, 'fetch(int times): bool; ok');
  const name = (id) => back.diagram.classes.find((c) => c.id === id).name;
  assert.deepEqual(back.diagram.relations.map((r) => [name(r.from), r.kind, name(r.to), r.label, r.fromCount, r.toCount]), [['Guide dog', 'inherits', 'Animal', '', '', ''], ['Cat', 'inherits', 'Animal', '', '', ''], ['Owner', 'aggregates', 'Animal', 'has', '1', '0..*'], ['Guide dog', 'uses', 'Owner', '', '', '1']]);
  assert.equal(classToMermaid(back.diagram, { title: 'Pets', description: 'Animals' }), text);
  const reversed = classFromMermaid('classDiagram\n  Dog --|> Animal\n  Wheel --* Car\n  Car ..|> Drivable : x\n  A "1" <-- "n" B');
  assert.equal(reversed.ok, true, reversed.reason);
  const n2 = (id) => reversed.diagram.classes.find((c) => c.id === id).name;
  assert.deepEqual(reversed.diagram.relations.map((r) => [n2(r.from), r.kind, n2(r.to), r.fromCount, r.toCount]), [['Dog', 'inherits', 'Animal', '', ''], ['Car', 'composes', 'Wheel', '', ''], ['Car', 'implements', 'Drivable', '', ''], ['B', 'uses', 'A', 'n', '1']]);
  const inline = classFromMermaid('classDiagram\n  class A\n  A : +int x\n  A : +foo() int\n  <<abstract>> A');
  assert.equal(inline.ok, true);
  assert.deepEqual(inline.diagram.classes[0].members.map((m) => [m.visibility, m.text]), [['+', 'int x'], ['+', 'foo() int']]);
  assert.equal(inline.diagram.classes[0].stereotype, 'abstract');
  assert.equal(classFromMermaid('classDiagram\n  A --> B\n  note for A "hi"').ok, false);
  assert.equal(classFromMermaid('classDiagram\n  namespace N {\n    class A\n  }').ok, false);
  assert.equal(classFromMermaid('classDiagram\n  A <|--|> B').ok, false);
  assert.equal(classFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(classFromMermaid(TEMPLATES.find((x) => x.id === 'class').source).ok);
  assert.equal(classToMermaid({ classes: [], relations: [], direction: 'TB' }, { title: '', description: '' }), '');
  assert.deepEqual(unrelated({ classes: [{ id: 'a', name: 'A', stereotype: '', members: [] }, { id: 'b', name: 'B', stereotype: '', members: [] }], relations: [], direction: 'TB' }).length, 2);
  assert.deepEqual(duplicateClasses({ classes: [{ id: 'a', name: 'X' }, { id: 'b', name: ' x ' }], relations: [], direction: 'TB' }), ['x']);
});

test('architecture diagrams round trip, keep what they were given, and refuse what they cannot hold', () => {
  const a = starterArchitecture();
  a.elements.push({ id: 'e9', kind: 'service', label: 'Message queue', icon: 'cloud', parent: 'e1', code: '' });
  a.elements.push({ id: 'e10', kind: 'junction', label: '', icon: '', parent: 'e1', code: '' });
  a.elements.push({ id: 'e11', kind: 'service', label: 'Browser [web]', icon: 'internet', parent: '', code: '' });
  a.connections.push({ id: 'k9', from: 'e9', fromSide: 'R', to: 'e10', toSide: 'L', arrows: 'both' });
  a.connections.push({ id: 'k10', from: 'e11', fromSide: 'B', to: 'e4', toSide: 'T', arrows: 'to' });
  const text = architectureToMermaid(a, { title: 'Web', description: 'A system' });
  assert.match(text, /^---\ntitle: "Web"\n---\narchitecture-beta/);
  assert.match(text, /    group api\(cloud\)\[API\]/);
  assert.match(text, /    service db\(database\)\[Database\] in api/);
  assert.match(text, /    service message_queue\(cloud\)\[Message queue\] in api/);
  assert.match(text, /    junction junction in api|    junction junction_2 in api/);
  assert.match(text, /    service browser_web\(internet\)\[Browser \(web\)\]\n/);
  assert.match(text, /    db:L -- R:server/);
  assert.match(text, /    message_queue:R <--> L:/);
  assert.match(text, /    browser_web:B --> T:server/);
  const back = architectureFromMermaid(text);
  assert.equal(back.ok, true, back.reason);
  assert.equal(back.title, 'Web');
  assert.deepEqual(back.architecture.elements.map((e) => [e.kind, e.label, e.icon]).slice(0, 5), [['group', 'API', 'cloud'], ['service', 'Database', 'database'], ['service', 'Disk', 'disk'], ['service', 'Server', 'server'], ['service', 'Message queue', 'cloud']]);
  const byId = Object.fromEntries(back.architecture.elements.map((e) => [e.id, e]));
  assert.equal(byId[back.architecture.elements[1].parent].label, 'API');
  assert.deepEqual(back.architecture.connections.map((c) => c.arrows), ['line', 'line', 'both', 'to']);
  assert.equal(architectureToMermaid(back.architecture, { title: 'Web', description: 'A system' }), text);
  assert.deepEqual(unconnectedElements(starterArchitecture()), []);
  // A service declared after the connection that uses it, and a group declared after what is inside it.
  const late = architectureFromMermaid('architecture-beta\n  a:R -- L:b\n  service a(server)[A] in g\n  service b(disk)[B]\n  group g(cloud)[G]');
  assert.equal(late.ok, true, late.reason);
  assert.match(architectureToMermaid(late.architecture, { title: '', description: '' }), /group g\(cloud\)\[G\]\n    service a/);
  assert.equal(architectureFromMermaid('architecture-beta\n  service a(logos:aws)[A]').ok, false);
  assert.equal(architectureFromMermaid('architecture-beta\n  group g(cloud)[G]\n  service a(server)[A] in g\n  service b(disk)[B]\n  a{group}:R -- L:b{group}').ok, false);
  assert.equal(architectureFromMermaid('architecture-beta\n  service a(server)[A]\n  service b(disk)[B]\n  a:R -- L:b : x').ok, false);
  assert.equal(architectureFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(architectureFromMermaid(TEMPLATES.find((x) => x.id === 'architecture').source).ok);
  assert.equal(architectureToMermaid({ elements: [], connections: [] }, { title: '', description: '' }), '');
});

test('block diagrams round trip, place blocks on the grid, and refuse what they cannot hold', () => {
  const d = starterBlocks();
  d.blocks.push({ id: 'b9', shape: 'diamond', label: 'Say "hi"; ok', span: 2, code: '' });
  d.blocks.push({ id: 'b10', shape: 'hexagon', label: 'Cache', span: 1, code: '' });
  d.links.push({ id: 'l9', from: 'b3', to: 'b9', arrow: false, label: '' });
  const text = blockToMermaid(d, { title: 'Web', description: 'A request' });
  assert.match(text, /^---\ntitle: "Web"\n---\nblock-beta\n    columns 3\n    browser\["Browser"\] space server\["Server"\]\n    db\[\("Database"\)\]:3\n/);
  assert.match(text, /say_hi_ok\{"Say #quot;hi#quot;#59; ok"\}:2 cache\{\{"Cache"\}\}/);
  assert.match(text, /    browser -- "request" --> server/);
  assert.match(text, /    server --- say_hi_ok/);
  assert.match(text, /%% volcanic/);
  const back = blockFromMermaid(text);
  assert.equal(back.ok, true, back.reason);
  assert.equal(back.title, 'Web');
  assert.equal(back.description, 'A request');
  assert.equal(back.diagram.columns, 3);
  assert.deepEqual(back.diagram.blocks.map((b) => [b.shape, b.label, b.span]), [['rect', 'Browser', 1], ['space', '', 1], ['rect', 'Server', 1], ['cylinder', 'Database', 3], ['diamond', 'Say "hi"; ok', 2], ['hexagon', 'Cache', 1]]);
  assert.deepEqual(back.diagram.links.map((l) => [l.arrow, l.label]), [[true, 'request'], [false, '']]);
  assert.equal(blockToMermaid(back.diagram, { title: 'Web', description: 'A request' }), text);
  assert.deepEqual(placeBlocks(back.diagram).map((p) => [p.row, p.from, p.to]), [[1, 1, 1], [1, 2, 2], [1, 3, 3], [2, 1, 3], [3, 1, 2], [3, 3, 3]]);
  assert.deepEqual(tooWide({ columns: 2, blocks: [{ id: 'a', span: 3 }, { id: 'b', span: 2 }], links: [] }).map((b) => b.id), ['a']);
  const shapes = blockFromMermaid('block-beta\n  a["rect"] b("round") c(["pill"]) d[["sub"]] e[("db")] f(("circle")) g>"flag"] h{"dia"} i{{"hex"}} j[/"para"/] k[\\"back"\\] l[/"trap"\\] m[\\"itrap"/] n((("dbl")))');
  assert.equal(shapes.ok, true, shapes.reason);
  assert.deepEqual(shapes.diagram.blocks.map((b) => b.shape), ['rect', 'round', 'stadium', 'subroutine', 'cylinder', 'circle', 'asymmetric', 'diamond', 'hexagon', 'parallelogram', 'parallelogramAlt', 'trapezoid', 'trapezoidAlt', 'doubleCircle']);
  assert.equal(blockFromMermaid('block-beta\n  columns auto\n  a b').diagram.columns, 0);
  assert.equal(blockFromMermaid('block-beta\n  block:g\n    columns 1\n    x y\n  end\n  z').ok, false);
  assert.equal(blockFromMermaid('block-beta\n  a b\n  style a fill:#f00').ok, false);
  assert.equal(blockFromMermaid('block-beta\n  a b c d e\n  a -.-> b').ok, false);
  assert.equal(blockFromMermaid('block-beta\n  a<[\"Label\"]>(right)').ok, false);
  assert.equal(blockFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(blockFromMermaid(TEMPLATES.find((x) => x.id === 'block').source).ok);
  assert.equal(blockToMermaid({ columns: 0, blocks: [], links: [] }, { title: '', description: '' }), '');
});

test('git graphs round trip, track the current branch, and say what cannot work', () => {
  const g = starterGit();
  g.orientation = 'TB';
  g.steps.push({ ...blankStep('g8', 'branch'), name: 'feature/x y', order: '2' });
  g.steps.push({ ...blankStep('g9', 'commit'), commitId: 'Fix "it"', tag: 'v2', type: 'REVERSE' });
  g.steps.push({ ...blankStep('g10', 'checkout'), name: 'main' });
  g.steps.push({ ...blankStep('g11', 'cherry-pick'), commitId: 'Feature' });
  const text = gitToMermaid(g, { title: 'Flow', description: 'History' });
  assert.match(text, /^---\ntitle: "Flow"\n---\ngitGraph TB:\n    accTitle: Flow/);
  assert.match(text, /    commit id: "Start"\n    commit\n    branch develop\n/);
  assert.match(text, /    merge develop tag: "v1\.0"/);
  assert.match(text, /    branch "feature\/x y" order: 2/);
  assert.match(text, /    commit id: "Fix 'it'" tag: "v2" type: REVERSE/);
  assert.match(text, /    cherry-pick id: "Feature"$/);
  assert.match(gitToMermaid({ orientation: 'LR', steps: [{ ...blankStep('p', 'cherry-pick'), commitId: 'M', parent: 'P', tag: 't' }] }, { title: '', description: '' }), /cherry-pick id: "M" parent: "P" tag: "t"/);
  const back = gitFromMermaid(text);
  assert.equal(back.ok, true, back.reason);
  assert.equal(back.title, 'Flow');
  assert.equal(back.graph.orientation, 'TB');
  assert.deepEqual(back.graph.steps.map((s) => s.action), ['commit', 'commit', 'branch', 'commit', 'checkout', 'merge', 'commit', 'branch', 'commit', 'checkout', 'cherry-pick']);
  assert.equal(back.graph.steps[7].name, 'feature/x y');
  assert.equal(back.graph.steps[8].type, 'REVERSE');
  assert.equal(gitToMermaid(back.graph, { title: 'Flow', description: 'History' }), text);
  assert.deepEqual(branchNames(back.graph), ['main', 'develop', 'feature/x y']);
  assert.deepEqual(branchAfter(back.graph), ['main', 'main', 'develop', 'develop', 'main', 'main', 'main', 'feature/x y', 'feature/x y', 'main', 'main']);
  assert.equal(gitProblem(g, { title: '', description: '' }), '');
  const bad = { orientation: 'LR', steps: [blankStep('a', 'commit'), { ...blankStep('b', 'merge'), name: 'ghost' }] };
  assert.match(gitProblem(bad, { title: '', description: '' }), /does not exist/);
  const sw = gitFromMermaid('gitGraph\n  commit\n  branch dev\n  switch main\n  commit type: NORMAL');
  assert.equal(sw.ok, true, sw.reason);
  assert.equal(sw.graph.steps[2].action, 'checkout');
  assert.equal(sw.graph.steps[3].type, '');
  assert.equal(gitFromMermaid('gitGraph LR:\n  commit').graph.orientation, 'LR');
  assert.equal(gitFromMermaid('gitGraph\n  commit id: "A" msg: "hello"').ok, false);
  assert.equal(gitFromMermaid('%%{init: {"gitGraph": {"mainBranchName": "trunk"}}}%%\ngitGraph\n  commit').ok, false);
  assert.equal(gitFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(gitFromMermaid(TEMPLATES.find((x) => x.id === 'git').source).ok);
  assert.equal(gitToMermaid({ steps: [], orientation: 'LR' }, { title: '', description: '' }), '');
});

test('requirement diagrams round trip, keep text safe, and refuse what they cannot hold', () => {
  const d = starterRequirements();
  d.direction = 'LR';
  d.items[0].text = 'Say "hi": it works; ok';
  d.items[0].reqId = 'REQ-1';
  d.items[1].name = 'second one';
  d.items.push({ ...blankItem('q9', 'element'), name: 'suite', elementType: 'test suite', docRef: 'specs/a.md' });
  d.items.push({ ...blankItem('q10', 'designConstraint'), name: 'limit', reqId: '9', text: 'Stay small', risk: '', verify: '' });
  d.relations.push({ id: 'r9', from: 'q9', to: 'q10', kind: 'verifies' });
  const text = requirementToMermaid(d, { title: 'Reqs', description: 'Things' });
  assert.match(text, /^---\ntitle: "Reqs"\n---\nrequirementDiagram/);
  assert.match(text, /    direction LR/);
  assert.match(text, /    requirement test_req \{\n        id: "REQ-1"\n        text: "Say 'hi'#58; it works#59; ok"|        text: "Say 'hi': it works#59; ok"/);
  assert.match(text, /    functionalRequirement "second one" \{/);
  assert.match(text, /    element suite \{\n        type: "test suite"\n        docref: "specs\/a\.md"/);
  assert.match(text, /    designConstraint limit \{\n        id: 9\n        text: "Stay small"\n    \}/);
  assert.match(text, /    suite - verifies -> limit/);
  const back = requirementFromMermaid(text);
  assert.equal(back.ok, true, back.reason);
  assert.equal(back.title, 'Reqs');
  assert.equal(back.diagram.direction, 'LR');
  assert.deepEqual(back.diagram.items.map((i) => [i.kind, i.name]), [['requirement', 'test_req'], ['functionalRequirement', 'second one'], ['element', 'test_entity'], ['element', 'suite'], ['designConstraint', 'limit']]);
  assert.equal(back.diagram.items[0].text, "Say 'hi': it works; ok");
  assert.deepEqual([back.diagram.items[0].risk, back.diagram.items[0].verify, back.diagram.items[4].risk, back.diagram.items[4].verify], ['high', 'test', '', '']);
  assert.equal(back.diagram.items[3].docRef, 'specs/a.md');
  assert.equal(requirementToMermaid(back.diagram, { title: 'Reqs', description: 'Things' }), text);
  const reversed = requirementFromMermaid('requirementDiagram\n  requirement a {\n    id: 1\n    text: x\n    risk: High\n    verifymethod: Test\n  }\n  requirement b {\n    id: 2\n    text: y\n    risk: low\n    verifymethod: analysis\n  }\n  b <- contains - a');
  assert.equal(reversed.ok, true, reversed.reason);
  assert.deepEqual([reversed.diagram.relations[0].from, reversed.diagram.relations[0].to, reversed.diagram.relations[0].kind], ['q1', 'q2', 'contains']);
  assert.equal(reversed.diagram.items[0].risk, 'high');
  // A new, empty requirement and element still draw: Pele refuses empty quoted values, so blanks are left out.
  const blank = { direction: 'TB', items: [blankItem('a', 'requirement'), blankItem('b', 'element')], relations: [] };
  const blankText = requirementToMermaid(blank, { title: '', description: '' });
  assert.doesNotMatch(blankText, /""/);
  assert.equal(requirementFromMermaid(blankText).ok, true);
  assert.deepEqual(untraced(starterRequirements()), []);
  assert.deepEqual(duplicateItems({ items: [{ name: 'A' }, { name: ' a ' }], relations: [], direction: 'TB' }), ['a']);
  assert.equal(requirementFromMermaid('requirementDiagram\n  requirement a {\n    id: 1\n    text: x\n    risk: low\n    verifymethod: test\n  }\n  style a fill:#f00').ok, false);
  assert.equal(requirementFromMermaid('requirementDiagram\n  a - satisfies -> b').ok, false);
  assert.equal(requirementFromMermaid('pie\n  "A" : 3').ok, false);
  assert.ok(requirementFromMermaid(TEMPLATES.find((x) => x.id === 'requirement').source).ok);
  assert.equal(requirementToMermaid({ items: [], relations: [], direction: 'TB' }, { title: '', description: '' }), '');
});
