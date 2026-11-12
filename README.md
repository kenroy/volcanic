# Volcanic

A visual editor for Mermaid diagrams in Obsidian, with a live preview rendered by [Pele](https://github.com/obsidianmd/pele).

Build flowcharts by dragging shapes around a canvas and connecting them. The result is saved as an ordinary `mermaid` code block, so it works anywhere Mermaid does.

## Using it

- Diagrams are edited **inside the note**. Double-click a diagram, or use its **Edit diagram** button, and it turns into the editor right where it sits; **Update diagram** puts it back and saves the change, and Escape cancels. This works in Live Preview and Reading view. In Source mode, or if you turn it off in **Settings → Volcanic**, the editor opens in a pop-up window instead.
- Click the ribbon icon, or run **Volcanic: Create or edit diagram at cursor**. With the cursor inside a `mermaid` block the diagram opens for editing; anywhere else a new one is inserted.
- Hover a diagram for two buttons: **Edit diagram**, and **Write below**, which puts the cursor on a line under the diagram (switching out of reading view if needed).
- Right-click a diagram and choose **Edit in Volcanic**, or **Write below diagram** to jump to a new line right after it (switching to editing view if the note is in reading view). Right-clicking elsewhere in the editor offers **Insert diagram with Volcanic**.

### Titles

A **Title** is optional but recommended. It is drawn above the diagram and is what screen readers announce; without one, a short note under the field reminds you that screen-reader users will not hear a name for the diagram (a description is used as the name if there is one). Flowcharts can also have a **Description**, a sentence for screen-reader users saying what the diagram shows. **Title position** puts it at the left, centre or right. The position applies wherever Volcanic draws the diagram; other Mermaid renderers centre it. In the Mermaid source the title is stored as front matter (`title:`), plus `accTitle` / `accDescr` for flowcharts.

### Visual mode (flowcharts)

| To do this | Mouse or touch | Keyboard |
| --- | --- | --- |
| Add a shape | Click a shape in the list, drag it onto the canvas, or double-click the canvas | Tab to the shape list, Enter |
| Move a shape | Drag it; guide lines appear and it snaps when its edges or centre line up with another shape (hold Alt to switch snapping off) | Arrow keys (Shift = bigger steps, Alt = 1px), or the Position fields |
| Rename | Double-click | Enter or F2 |
| Connect | Drag the dot on a shape's edge to another shape, or use **Connect** and click two shapes | `C`, move to the target, Enter — or **Connect to** in Properties |
| Delete | Select, then **Delete** in Properties | Delete or Backspace |
| Undo / redo | Toolbar | Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z |
| Finish | **Insert diagram** | Ctrl/Cmd+Enter |

**Tidy up** arranges the shapes to follow the flow direction.

### Sequence diagrams

Choose **Sequence diagram** under *Diagram type* when starting a new diagram. Add participants, messages and notes; drag a message up or down to reorder it, drag a participant left or right, and edit text, direction and line style in **Properties**. Double-click a participant, message or note to edit its text in place. Keyboard: arrows move between steps, Alt+arrows reorder, Enter edits the text, Space opens Properties, Delete removes. The **Outline** tab lists every step as a sentence. Diagrams using loops, groups or activations open as text instead, so nothing is lost.

Any diagram can be opened straight in Code mode: use the **Edit source** button on a diagram, right-click → **Edit source in Volcanic**, or the command **Edit diagram source at cursor**. You can also switch between **Visual** and **Code** inside the editor at any time.

### Gantt charts

Choose **Gantt chart** under *Diagram type*. Drag a bar to change when a task starts, drag its right end to change its length, and use Zoom for days, weeks or months. A task can start on a date or after another task finishes; dragging one that follows another fixes it to a date. Double-click a task or section name to rename it in place (or press Enter on it). Keyboard: left/right arrows move a task a day (Shift for a week), Alt+left/right change its length, up/down move between tasks. Charts using excluded days, other date formats or other options open as text instead.

The diagram type can be chosen only until you have changed the starter. To change the type later, cancel and start a new diagram.

### Pie charts

Choose **Pie chart** in the diagram type menu. Each slice is a row: type its name and value, or move the slider, and its share of the total updates as you go. Drag a row by its grip to reorder (Alt with the up and down arrow keys does the same, and Escape cancels a drag). **Sort by size** orders slices from largest to smallest, and **Show each value beside its name** turns on Mermaid's `showData`. Slice colours follow the order of the rows, so they match the finished chart. Negative values and unusual lines open in Code mode.


### Radar charts

Choose **Radar chart** in the diagram type menu. The editor is a grid: each row is an axis (a spoke of the web) and each column is a series (a shape on it), so you type a score into any cell. **Add axis** and **Add series** grow the grid, the arrow buttons (or Alt with the up and down arrow keys) reorder axes, and each series' swatch matches its colour in the finished chart. The side panel sets the legend, the grid shape (circles or polygons), the number of rings, and the lowest and highest score; leave the highest score empty to fit the biggest value, and a warning appears if any score would go past the edge. Negative scores and unusual lines open in Code mode.


### Quadrant charts

Choose **Quadrant chart** in the diagram type menu. The chart is a square you can work on directly: drag a point to where it belongs, or focus it and use the arrow keys (hold Shift for bigger steps; Escape cancels a drag). A table under the square sets exact positions from 0 to 100 and renames or removes points. The side panel holds the two axis labels and the four quadrant names. Points that carry their own colour or size, classes and other unusual lines open in Code mode.


### Timelines

Choose **Timeline** in the diagram type menu. The editor is an outline: optional sections, each holding periods (a year, an age, a quarter), each holding the events in it. **Add period** and **Add section** grow the outline, **Add event** sits under each period, and the arrow buttons (or Alt with the up and down arrow keys in a field) reorder things. A period moves into the neighbouring section when it reaches the edge of its own. Timelines that set a direction or use unusual lines open in Code mode.


### XY charts

Choose **XY chart** in the diagram type menu. The editor is a grid: each row is an item on the horizontal axis (a month, a team) and each column is a series, drawn as bars or as a line, so you type a value into any cell. **Add item** and **Add series** grow the grid, the arrow buttons (or Alt with the up and down arrow keys) reorder items, and the side panel sets the axis titles, the range of the value axis and whether bars stand up or lie sideways. Charts with a numeric horizontal axis, or a series that does not have one value per item, open in Code mode.


### Kanban boards

Choose **Kanban board** in the diagram type menu. A board is columns of cards. Drag a card by its grip to reorder it or move it to another column (Escape cancels a drag), or hold Alt with the arrow keys in a card's field: up and down within the column, left and right into the next one. **Details** on a card opens its owner, ticket reference and priority. **Add card** sits under each column, **Add column** is in the toolbar, and the arrow buttons reorder columns. A board description is kept in Volcanic's comment, because Mermaid's kanban has no description line. Cards with other details (icons, for example) open in Code mode.

### Mind maps

Choose **Mind map** in the diagram type menu. The central idea sits in the middle with its first branches to the right and the rest to the left, laid out the way Pele draws it, and every idea can be moved in three ways:

- **Drag** an idea onto another to put it inside, or onto the top or bottom edge of one to put it before or after. Escape cancels a drag.
- **Keyboard:** the arrow keys move between ideas, Enter adds an idea beside the current one, Command or Control with Enter adds one inside it, F2 renames, Delete removes. Hold Alt with the arrows to move an idea: up and down reorder it; toward the centre moves it out a level and away from it moves it into the idea above. Left and right follow the picture, so on the left side of the map they swap.
- **Properties and Outline panels:** the same actions as buttons, plus the idea's text and shape (plain, rounded, square, circle, bang, cloud or hexagon).

Pele's mind maps have no accessible-description line, so the description is kept in the `%% volcanic:` comment and given to screen readers by Volcanic. Maps that use icons, classes or more than one top-level idea open in Code mode.

### User journeys

Choose **User journey** in the diagram type menu. Steps run left to right in sections, and each step sits as high as the score for how the person felt (5 at the top, 1 at the bottom), with a line through them as in the finished journey. Coloured dots show who is involved.

- **Drag** a step up or down to change its score, and sideways to move it, including into another section or an empty one. A line shows where it will land, and Escape cancels.
- **Keyboard:** left and right move between steps, up and down raise or lower the score, Alt with left and right moves a step earlier or later (across sections too), Enter adds a step after this one, F2 renames, Delete removes.
- **Properties and Outline panels:** name, score, section and the people involved, plus move and delete buttons. A step's people are added by typing a name; everyone already in the journey appears as a checkbox.

### Code mode (everything else)

Class, state, ER, pie, mind map, timeline and any other diagram Pele supports are edited as text with a live preview and starter templates. Flowcharts that use features the canvas does not cover (subgraphs, custom styles, links) also open here, so nothing is lost.

## Colour themes

Every diagram can have its own colour theme, chosen from the swatches under the title in the editor: Obsidian (your own theme colours), Ocean, Forest, Sunset, Lavender, Rose, Graphite, Mint, Sand, Berry, Citrus, Coral, Midnight, Autumn, Vivid and High contrast. Each has a light and a dark version, and the text on every colour is checked for readable contrast. Settings → Volcanic → **Default colour theme** sets the one used by diagrams that have not picked their own. The choice is stored in the `%% volcanic:` comment, so it travels with the note.

## Public holidays on Gantt charts

Open the **Holidays** button above the timeline and add every country your teams work in (and, where a country has them, a state or region) to mark their public holidays. Each country gets a colour from its flag where it can (the United States blue, Mexico green, Colombia yellow, Peru red, Chile navy) and never shares a colour with another country on the same chart, and a day several countries share is split into side-by-side stripes, one per country; the Outline tab and the tooltips name each holiday with its country. In notes, a legend under the chart gives each country its own line with a checkbox, so you can switch a country's holidays off and on; Volcanic remembers your choice for that chart on this computer. The editor shades each holiday and flags it in the date ruler, and the Outline tab lists the ones that fall during the project. In notes the chart gets the same faint bands, plus a line of text under it naming the holidays, so the information is not only in colour. Holiday data comes from the bundled date-holidays library, so it works offline. The **Days** menu widens the list beyond public holidays to bank and optional holidays, or observances too. Canada has a **Federal** region (banks and other federally regulated employers), which includes Remembrance Day. The choice is stored in the `%% volcanic:` comment.

## Text size

Each diagram has a **Text size** menu next to the colour theme (12 to 28 pixels; Pele's own is 16), and Settings → Volcanic → **Diagram text size** sets the default for diagrams that have not chosen one. Pele lays the whole diagram out for the size, so shapes and bars grow with the text. Where Obsidian draws the diagram itself, Volcanic draws it with Pele instead whenever a size has been chosen.

## Resizing the editor

A bar under the editor changes its height: drag it, or focus it and use the arrow keys (Shift for bigger steps, Page Up and Page Down for a lot, Home and End for the smallest and largest). Double-click it to go back to the default. Volcanic remembers the height you chose, separately for the in-note editor and the pop-up window.

## Good to know

- Canvas positions are for arranging your work. Mermaid lays diagrams out automatically, so the **Preview** shows the final result. Positions are remembered in a `%% volcanic:` comment on the last line of the block; deleting it is harmless.
- Diagrams in your notes are drawn by the bundled Pele too, so they match the editor preview. This applies to every `mermaid` block, not only ones made here. Turn it off in **Settings → Volcanic** to go back to Obsidian's own renderer.

## Accessibility

- Everything works from the keyboard, and nothing requires dragging: every drag has a click or form alternative.
- The **Outline** tab lists all shapes and connections as text, and each opens for editing.
- Changes are announced through a live status line. Focus is always visible, and the dialog keeps focus inside it and returns it when closed.
- Colours come from your theme; reduced-motion and forced-colours settings are respected.

## Development

```bash
npm install
npm run build     # type-check and bundle main.js
npm test          # Mermaid round-trip tests
npm run harness   # editor on its own at http://127.0.0.1:4173/dev/
```

To install into a vault, copy `main.js`, `manifest.json` and `styles.css` to `<vault>/.obsidian/plugins/volcanic/` and enable **Volcanic** in Community plugins.

## Licence

Volcanic is released under the [MIT licence](LICENSE). It bundles [Pele](https://github.com/obsidianmd/pele) and [date-holidays](https://github.com/commenthol/date-holidays), among other packages; their licences, including the CC BY-SA 4.0 holiday data, are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
