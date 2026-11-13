// Browser-only test page: mounts the editor without Obsidian.
import './obsidian-shim.js';
import { DiagramEditor } from '../src/editor';
import { resizeHandle } from '../src/ui';
import { mount } from 'pele';
import { readDescription } from '../src/kinds';
import { setDescription } from '../src/description';
import { setHolidayBands } from '../src/holidayBands';
import { setTaskDetails } from '../src/taskDetails';
import { readFontSize, stripMeta } from '../src/mermaid';

const params = new URLSearchParams(location.search);
const samples: Record<string, string> = {
  flow: 'flowchart TD\n    A([Start]) --> B{Is it working?}\n    B -->|Yes| C[Ship it]\n    B -->|No| D[(Check logs)]\n    D -.-> B',
  seq: 'sequenceDiagram\n    A->>B: Hello',
  seq2: '---\ntitle: "Order flow"\n---\nsequenceDiagram\n    participant U as User\n    participant S as Shop\n    actor B as Bank\n    U->>S: Place order\n    S->>B: Charge card\n    Note right of B: Checks fraud\n    B-->>S: Approved\n    S-->>U: Confirmation',
  ganttPeople: '---\ntitle: "Launch plan"\n---\ngantt\n    accDescr: Who does what, and how far along each piece is.\n    dateFormat YYYY-MM-DD\n    section Design\n    Research :done, t1, 2026-01-05, 7d\n    Mockups :active, t2, after t1, 5d\n    section Build\n    Develop :crit, t3, after t2, 10d\n    Launch :milestone, t4, 2026-02-02, 0d\n%% volcanic:{"v":1,"tasks":{"t1":{"a":"Martin Tamer","p":100},"t2":{"a":"Rose Fuller","p":55},"t3":{"p":10},"t4":{"a":"Fuller King"}}}',
  ganttHolidays: '---\ntitle: "Year-end release"\n---\ngantt\n    dateFormat YYYY-MM-DD\n    section Prepare\n    Freeze scope :t1, 2025-11-17, 14d\n    Test :t2, after t1, 21d\n    section Ship\n    Release :t3, after t2, 7d\n    Review :t4, after t3, 10d\n%% volcanic:{"v":1,"holidays":[{"c":"US"},{"c":"MX"},{"c":"CO"},{"c":"PE"},{"c":"CL"}]}',
  chain: '---\ntitle: "Chain"\n---\nflowchart LR\n    n1(["Start"]) --> n2("Step") --> n3["Step"] --> n4[("Database")] --> n5[["Step"]] --> n6(("STOP"))\n%% volcanic:{"v":1,"pos":{"n1":[40,60],"n2":[270,60],"n3":[500,60],"n4":[730,40],"n5":[960,60],"n6":[1190,50]}}',
  mind: '---\ntitle: "Launch plan"\n---\nmindmap\n  root((Launch plan))\n    Research\n      Interviews\n      Survey\n    Design\n      Wireframes\n      n9["Prototype (v1)"]\n    Build\n      API\n      App\n    Ship\n%% volcanic:{"v":1,"desc":"What we do, in what order."}',
  pie: '---\ntitle: "Where the week goes"\n---\npie showData\n    accDescr: How my working hours are split.\n    "Meetings" : 30\n    "Design" : 25\n    "Build" : 35\n    "Review" : 10',
  state: '---\ntitle: "Media player"\n---\nstateDiagram-v2\n    accTitle: Media player\n    accDescr: How a media player moves between playing and stopped.\n    direction LR\n    state "Waiting for input" as s1\n    [*] --> s1\n    s1 --> Playing: play\n    Playing --> Paused: pause\n    Paused --> Playing: resume\n    Playing --> s1: stop\n    Playing --> [*]: error',
  er: '---\ntitle: "Online shop"\n---\nerDiagram\n    accTitle: Online shop\n    accDescr: Customers place orders that contain products.\n    CUSTOMER {\n        int id PK\n        string name\n        string email UK "used to sign in"\n    }\n    ORDER {\n        int id PK\n        int customer_id FK\n    }\n    "Line item"\n    CUSTOMER ||--o{ ORDER : "places"\n    ORDER ||..|{ "Line item" : "contains"',
  class: '---\ntitle: "Pets"\n---\nclassDiagram\n    accTitle: Pets\n    accDescr: Dogs and cats are animals; an owner has pets.\n    class Animal {\n        <<abstract>>\n        +String name\n        +speak() void\n    }\n    class Dog {\n        +fetch() void\n    }\n    class Cat {\n        +purr() void\n    }\n    class Owner\n    Animal <|-- Dog\n    Animal <|-- Cat\n    Owner "1" --> "0..*" Animal : has',
  architecture: '---\ntitle: "Web app"\n---\narchitecture-beta\n    accTitle: Web app\n    accDescr: A browser talks to an API that stores data in a database and a disk.\n    group api(cloud)[API]\n    service db(database)[Database] in api\n    service disk(disk)[Storage] in api\n    service server(server)[Server] in api\n    service browser(internet)[Browser]\n    junction fork in api\n    browser:R -- L:server\n    server:B -- T:fork\n    fork:L --> R:db\n    fork:R --> L:disk',
  block: '---\ntitle: "Web request"\n---\nblock-beta\n    columns 3\n    browser["Browser"] space server("Server")\n    db[("Database")]:3\n    browser -- "request" --> server\n    server --> db',
  git: '---\ntitle: "Release flow"\n---\ngitGraph\n    accTitle: Release flow\n    accDescr: A feature branch is merged into main and tagged.\n    commit id: "Start"\n    commit\n    branch develop\n    commit id: "Feature" type: HIGHLIGHT\n    checkout main\n    merge develop tag: "v1.0"\n    commit',
  requirement: '---\ntitle: "Login"\n---\nrequirementDiagram\n    accTitle: Login\n    accDescr: A login requirement, satisfied by a form and verified by a test.\n    requirement login_works {\n        id: "REQ-1"\n        text: "Users can sign in with an email: and a password."\n        risk: high\n        verifymethod: test\n    }\n    functionalRequirement lockout {\n        id: "REQ-1.1"\n        text: "Lock the account after five failed tries."\n        risk: medium\n        verifymethod: demonstration\n    }\n    element login_form {\n        type: module\n        docref: "specs/login.md"\n    }\n    element login_tests {\n        type: "test suite"\n    }\n    login_works - contains -> lockout\n    login_form - satisfies -> login_works\n    login_tests - verifies -> login_works',
  c4: '---\ntitle: "Internet banking"\n---\nC4Context\n    accTitle: Internet banking\n    accDescr: Customers use the banking system, which relies on an email system.\n    Person(customer, "Customer", "A customer of the bank")\n    System_Ext(mail, "E-mail system", "Sends messages")\n    Enterprise_Boundary(bank, "Bank") {\n        System(banking, "Banking system", "Lets customers view accounts")\n        SystemDb(store, "Account store")\n    }\n    Rel(customer, banking, "Uses", "HTTPS")\n    Rel(banking, store, "Reads and writes")\n    Rel_D(banking, mail, "Sends e-mail using")',
  packet: '---\ntitle: "TCP header"\n---\npacket-beta\n    accDescr: The first fields of a TCP segment.\n    0-15: "Source port"\n    16-31: "Destination port"\n    32-63: "Sequence number"\n    64-95: "Acknowledgment number"',
  treemap: '---\ntitle: "Company"\n---\ntreemap-beta\n    accDescr: Where the people are.\n"Company"\n  "Engineering": 40\n  "Sales"\n    "Europe": 10\n    "Americas": 15\n  "Support": 15',
  sankey: '---\ntitle: "Energy"\n---\nsankey-beta\n\nEnergy,Home,40\nEnergy,Industry,60\nHome,Heating,25\nHome,Lighting,15\nIndustry,Machines,45\nIndustry,"Transport, local",15',
  kanban: '---\ntitle: "Launch board"\n---\nkanban\n  c1[To do]\n    c1k1[Write the spec]@{ assigned: \'Ann\', priority: \'High\' }\n    c1k2[Draw the screens]\n  c2[In progress]\n    c2k1[Build the editor]@{ ticket: \'ABC-12\' }\n  c3[Done]\n    c3k1[Set up the project]',
  xychart: '---\ntitle: "Sales"\n---\nxychart-beta\n    accDescr: Revenue against target.\n    x-axis [Jan, Feb, Mar, Apr, May]\n    y-axis "Revenue" 0 --> 100\n    bar "Revenue" [30, 50, 80, 60, 90]\n    line "Target" [40, 50, 60, 70, 80]',
  timeline: '---\ntitle: "Product history"\n---\ntimeline\n    accDescr: How the product grew.\n    section Early days\n      2022 : First idea\n      2024 : Prototype : First users\n    section Growth\n      2026 : Release\n           : Press coverage',
  quadrant: '---\ntitle: "What to do first"\n---\nquadrantChart\n    accDescr: Ideas by effort and value.\n    x-axis Low effort --> High effort\n    y-axis Low value --> High value\n    quadrant-1 Plan\n    quadrant-2 Do first\n    quadrant-3 Drop\n    quadrant-4 Delegate\n    Idea A: [0.3, 0.7]\n    Idea B: [0.7, 0.8]\n    Idea C: [0.2, 0.25]\n    Idea D: [0.75, 0.3]',
  radar: '---\ntitle: "Team skills"\n---\nradar-beta\n    accDescr: How each person scores on five skills.\n    axis a1["Design"], a2["Code"], a3["Test"], a4["Docs"], a5["Ops"]\n    curve c6["Alice"]{4, 3, 2, 5, 1}\n    curve c7["Bob"]{2, 5, 4, 1, 3}\n    max 5',
  journey: '---\ntitle: "Ordering a coffee"\n---\njourney\n    accTitle: Ordering a coffee\n    accDescr: How a customer feels at each step.\n    section Arrive\n      Find the shop: 4: Customer\n      Join the queue: 2: Customer\n    section Order\n      Choose a drink: 5: Customer, Barista\n      Pay: 3: Customer, Barista\n    section Enjoy\n      Wait for the drink: 2: Customer\n      Sit and drink: 5: Customer',
  gantt: '---\ntitle: "Launch plan"\n---\ngantt\n    dateFormat YYYY-MM-DD\n    section Design\n    Research :done, t1, 2026-01-05, 7d\n    Mockups :active, t2, after t1, 5d\n    section Build\n    Develop :crit, t3, after t2, 10d\n    Launch :milestone, t4, 2026-02-02, 0d',
  labels:
    'flowchart LR\n n1(["START"]) --> n2("First step") --> n4{"Why?"}\n n4 --> n5("Because")\n n4 --> n6("I don\'t know")\n n5 -->|"I don\'t like Mondays"| n7[("Check the db")]\n n6 -->|"Tell me why!"| n7\n n7 --> n8["DONE"]',
  labelsTd: 'flowchart TD\n A([Start]) --> B{Is it working?}\n B -->|Yes| C[Ship it]\n B -->|No| D[(Check logs)]\n D -.->|Try again| B',
};
const source = samples[params.get('sample') ?? ''] ?? null;
if (params.get('theme') === 'dark') document.body.classList.add('theme-dark');

const output = document.getElementById('output')!;
const mountEditor = (): void => {
  const outer = document.getElementById('host')!;
  outer.replaceChildren();
  // ?inline=1 mimics the editor sitting inside a narrow note column.
  const inline = params.get('inline') === '1';
  const host = inline ? createDiv({ cls: 'volcanic-inline-host harness-inline' }) : outer;
  if (inline) {
    outer.classList.add('harness-inline-outer');
    host.style.setProperty('--harness-width', params.get('w') ? `${params.get('w')}px` : '720px');
    outer.append(host);
    const grip = resizeHandle(host, { min: 480, max: () => Math.max(600, window.innerHeight * 3), storageKey: 'volcanic-inline-height-harness' });
    host.after(grip);
  }
  const editor = new DiagramEditor(
    host,
    {
      setIcon: (el, name) => {
        el.replaceChildren(createEl('img', { attr: { src: `https://unpkg.com/lucide-static@0.460.0/icons/${name}.svg`, alt: '' } }));
      },
      labelsBesideLines: true,
      inline,
      submitLabel: source ? 'Update diagram' : 'Insert diagram',
      onSubmit: (text) => (output.textContent = text),
      onCancel: () => (output.textContent = editor.cancelTransient() ? '(transient cancelled)' : '(cancelled)'),
    },
    source,
  );
  (window as unknown as { editor: DiagramEditor }).editor = editor;
};
mountEditor();

// ?notes=1 also draws the chart the way a note shows it, with its legend.
if (params.get('notes') === '1' && source) {
  const holder = createDiv({ cls: 'harness-notes', attr: { id: 'notes-view' } });
  document.body.append(holder);
  const host = createDiv();
  holder.append(host);
  const finish = (): void => {
    setTaskDetails(host, source, true);
    setHolidayBands(host, source, { legend: true, storageKey: 'harness-holidays-off' });
    setDescription(host, readDescription(source), 'center');
  };
  const size = readFontSize(source);
  mount(host, stripMeta(source), { zoom: false, ...(size ? { fontSize: size } : {}), onRender: finish });
  finish();
}
