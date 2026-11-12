# Third-party notices

Volcanic's own code is released under the MIT licence (see `LICENSE`). The built plugin (`main.js`) also contains
the following open-source packages, each under its own licence.

| Package | Licence | Used for |
| --- | --- | --- |
| [pele](https://github.com/obsidianmd/pele) 1.13 | MIT, Copyright (c) 2026 kepano | Parsing and drawing every diagram |
| [date-holidays](https://github.com/commenthol/date-holidays) 3.39 | ISC (code), CC BY-SA 4.0 (data) | Public holidays shown on Gantt charts |
| date-holidays-parser | ISC | Part of date-holidays |
| caldate | ISC | Part of date-holidays |
| moment, moment-timezone | MIT | Part of date-holidays |
| astronomia, date-bengali-revised, date-chinese, date-easter, @hnw/date-tibetan, deepmerge, jalaali-js, js-yaml, lodash | MIT | Part of date-holidays |
| argparse | PSF-2.0 | Part of date-holidays |
| prepin | Unlicense | Part of date-holidays |

## Holiday data

The holiday rules that date-holidays ships (`holidays.yaml`) are available under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). They are derived from Wikipedia articles and are
credited to Wikipedia contributors and the date-holidays project. The data is included in `main.js` unchanged and
stays under CC BY-SA 4.0; the rest of Volcanic stays under the MIT licence.

The full licence text of each package is in its own folder under `node_modules` when you install the project.
