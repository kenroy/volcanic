/**
 * Ready-made colour themes. Pele reads its colours from CSS variables, so a theme is a set of
 * variables for light and for dark mode, applied to a diagram through a data attribute.
 */

export interface ThemeColours {
  accent: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  line: string;
  critical: string;
  /** Eight colours for charts, sections and series. */
  series: string[];
}

export interface Theme {
  id: string;
  name: string;
  /** One line shown as a hint. */
  description: string;
  /** Absent for themes that leave Obsidian's own colours alone. */
  light?: ThemeColours;
  dark?: ThemeColours;
}

/** Stored when a diagram has no theme of its own: use the one chosen in settings. */
export const DEFAULT_THEME_ID = '';
/** Obsidian's own colours, even when the settings pick another theme. */
export const OBSIDIAN_THEME_ID = 'obsidian';
/** Attribute on an editor whose theme brings no colours, so it does not inherit those of the note around it. */
export const NO_THEME_ATTR = 'data-volcanic-no-theme';

export const THEMES: Theme[] = [
  { id: OBSIDIAN_THEME_ID, name: 'Obsidian', description: 'Follows your Obsidian theme and accent colour.' },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Cool blues and teals.',
    light: {
      accent: '#1b6ca8',
      surface: '#e8f2fa',
      surfaceAlt: '#d3e6f4',
      border: '#4a7fa6',
      line: '#35688c',
      critical: '#c4372f',
      series: ['#1b6ca8', '#1f8a80', '#5b84c4', '#d98a1c', '#7a5bb5', '#c4372f', '#2b97ad', '#66788a'],
    },
    dark: {
      accent: '#5fb3e8',
      surface: '#16293a',
      surfaceAlt: '#1f3a52',
      border: '#6aa6cf',
      line: '#8cbbdc',
      critical: '#ff7a70',
      series: ['#5fb3e8', '#4cc2b4', '#8fb0ea', '#f2b455', '#b79cf0', '#ff7a70', '#58c6dc', '#a0b0c0'],
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Calm greens with warm accents.',
    light: {
      accent: '#2d7a4d',
      surface: '#e9f4ec',
      surfaceAlt: '#d5eadb',
      border: '#528a68',
      line: '#3d7253',
      critical: '#c4372f',
      series: ['#2d7a4d', '#7a9a1f', '#2a8f8a', '#c9892a', '#8a6b4a', '#c4372f', '#5b8d3a', '#6b7c72'],
    },
    dark: {
      accent: '#6fcf97',
      surface: '#16301f',
      surfaceAlt: '#21402c',
      border: '#6fa985',
      line: '#8fc4a3',
      critical: '#ff7a70',
      series: ['#6fcf97', '#b5d35a', '#58c9c2', '#efb35a', '#c4a27c', '#ff7a70', '#91cf6b', '#a0b3a8'],
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm oranges and corals.',
    light: {
      accent: '#c0501a',
      surface: '#fdf0e6',
      surfaceAlt: '#fadfc9',
      border: '#b5683a',
      line: '#9a532c',
      critical: '#b3261e',
      series: ['#c0501a', '#d9981f', '#b5365a', '#7d5aa6', '#2f7f8a', '#b3261e', '#8f6b3a', '#7a6c63'],
    },
    dark: {
      accent: '#ff9460',
      surface: '#3a2216',
      surfaceAlt: '#4e2f1d',
      border: '#d79067',
      line: '#e5a77f',
      critical: '#ff8078',
      series: ['#ff9460', '#f2c04a', '#f07a9a', '#b79cf0', '#58c0cc', '#ff8078', '#d6b07a', '#b8a89c'],
    },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    description: 'Soft purples and blues.',
    light: {
      accent: '#6246c9',
      surface: '#f0ecfb',
      surfaceAlt: '#e1d9f7',
      border: '#7d69bd',
      line: '#62519f',
      critical: '#b3261e',
      series: ['#6246c9', '#2f78c4', '#b0408c', '#2a8f84', '#d08a22', '#b3261e', '#8a63c4', '#6f6c85'],
    },
    dark: {
      accent: '#a592f5',
      surface: '#272046',
      surfaceAlt: '#352c5e',
      border: '#9a89dd',
      line: '#b7a9ee',
      critical: '#ff8078',
      series: ['#a592f5', '#6fb1f2', '#f08fcc', '#5cc9bd', '#f2bd62', '#ff8078', '#c1a2f0', '#aaa6c4'],
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    description: 'Warm pinks with a deep red edge.',
    light: {
      accent: '#c2335f',
      surface: '#fbebf0',
      surfaceAlt: '#f6d6e0',
      border: '#b9577a',
      line: '#9e4162',
      critical: '#a8201a',
      series: ['#c2335f', '#d98a2a', '#7d4fb0', '#2c8a86', '#3f72c0', '#a8201a', '#b86a8c', '#7a6b72'],
    },
    dark: {
      accent: '#f27a9d',
      surface: '#3a1824',
      surfaceAlt: '#4e2231',
      border: '#d9819d',
      line: '#eb9db5',
      critical: '#ff8a80',
      series: ['#f27a9d', '#f2bd62', '#b79cf0', '#58c9c2', '#7fa8f0', '#ff8a80', '#e3a0b8', '#b8a6ad'],
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Quiet greys, good for printing.',
    light: {
      accent: '#3d4a5c',
      surface: '#eceff2',
      surfaceAlt: '#dde2e7',
      border: '#6e7a88',
      line: '#566170',
      critical: '#b3261e',
      series: ['#3d4a5c', '#6b7a8c', '#8a96a6', '#a5744a', '#4f7f88', '#b3261e', '#5d6b52', '#7a7a7a'],
    },
    dark: {
      accent: '#aeb8c6',
      surface: '#24282e',
      surfaceAlt: '#323840',
      border: '#8b95a3',
      line: '#aab3bf',
      critical: '#ff8078',
      series: ['#aeb8c6', '#8795a8', '#c5ccd6', '#d9a577', '#7fb5bd', '#ff8078', '#9fb592', '#b0b0b0'],
    },
  },
  {
    id: 'mint',
    name: 'Mint',
    description: 'Fresh greens and aqua.',
    light: {
      accent: '#0f8a6d',
      surface: '#e6f7f1',
      surfaceAlt: '#cdeee2',
      border: '#3f9c85',
      line: '#2d7c69',
      critical: '#c4372f',
      series: ['#0f8a6d', '#3aa1d8', '#7a9f1c', '#d98a26', '#9a6bd1', '#c4372f', '#14a3a3', '#6c8079'],
    },
    dark: {
      accent: '#52d6b2',
      surface: '#10302a',
      surfaceAlt: '#174238',
      border: '#5fbfa6',
      line: '#86d9c3',
      critical: '#ff7a70',
      series: ['#52d6b2', '#69b9ec', '#b4d65a', '#f2b55c', '#c3a0f0', '#ff7a70', '#4fd0d0', '#a0b8b0'],
    },
  },
  {
    id: 'sand',
    name: 'Sand',
    description: 'Warm desert neutrals.',
    light: {
      accent: '#8f6226',
      surface: '#f8f1e3',
      surfaceAlt: '#efe2c6',
      border: '#9c7c45',
      line: '#7d6035',
      critical: '#b3261e',
      series: ['#8f6226', '#5f8447', '#b5543a', '#4a7a94', '#a8821a', '#8b5a7a', '#7a6a50', '#5f6b5f'],
    },
    dark: {
      accent: '#e0b56a',
      surface: '#33291a',
      surfaceAlt: '#46391f',
      border: '#c9a66a',
      line: '#d8bc84',
      critical: '#ff8078',
      series: ['#e0b56a', '#98c07a', '#e48a70', '#7fb4cf', '#e8c85a', '#cf9ab8', '#b8a888', '#a0aa9c'],
    },
  },
  {
    id: 'berry',
    name: 'Berry',
    description: 'Rich plums and magentas.',
    light: {
      accent: '#8e2a73',
      surface: '#f8e9f3',
      surfaceAlt: '#f0d2e5',
      border: '#9c4d8a',
      line: '#823a70',
      critical: '#b3261e',
      series: ['#8e2a73', '#5b4bb5', '#d1447c', '#2a8a8a', '#d98a2a', '#3f6fb5', '#a85a9a', '#76687a'],
    },
    dark: {
      accent: '#e28bc9',
      surface: '#351a2f',
      surfaceAlt: '#4a2442',
      border: '#c985b8',
      line: '#dba0cc',
      critical: '#ff8078',
      series: ['#e28bc9', '#9a8ef0', '#f27aa8', '#58c9c9', '#f2b45a', '#7fa6ee', '#d6a0cc', '#b8a8bc'],
    },
  },
  {
    id: 'citrus',
    name: 'Citrus',
    description: 'Sunny yellows and zesty greens.',
    light: {
      accent: '#a86400',
      surface: '#fff6d9',
      surfaceAlt: '#fdeaa8',
      border: '#a07c10',
      line: '#85630c',
      critical: '#b3261e',
      series: ['#a86400', '#4f8a1a', '#d4492f', '#2f8f9e', '#8a5cc2', '#b07a00', '#6f7f20', '#6f6a55'],
    },
    dark: {
      accent: '#ffc233',
      surface: '#36300f',
      surfaceAlt: '#4a4214',
      border: '#d6b43a',
      line: '#e6c85c',
      critical: '#ff8078',
      series: ['#ffc233', '#9ad45a', '#ff7e66', '#5ccbdb', '#bf9af0', '#ffd466', '#c5d45c', '#b5b09a'],
    },
  },
  {
    id: 'coral',
    name: 'Coral',
    description: 'Warm coral with cool teal.',
    light: {
      accent: '#c9442f',
      surface: '#fdeeea',
      surfaceAlt: '#f9d9d1',
      border: '#b8604f',
      line: '#a14434',
      critical: '#a8201a',
      series: ['#c9442f', '#2e8f9a', '#d99a2a', '#5b6fc4', '#6f9a2e', '#a8201a', '#c46a8c', '#7c6c68'],
    },
    dark: {
      accent: '#ff8a75',
      surface: '#3a1d18',
      surfaceAlt: '#4f2a22',
      border: '#e0907f',
      line: '#eba596',
      critical: '#ff8a80',
      series: ['#ff8a75', '#5ccbd6', '#f2c25c', '#8fa0f0', '#a9cf62', '#ff8a80', '#e59ab8', '#b8a8a4'],
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep navy with violet and cyan.',
    light: {
      accent: '#1f3a8a',
      surface: '#e9edf8',
      surfaceAlt: '#d6ddf1',
      border: '#51669f',
      line: '#3b4f86',
      critical: '#b3261e',
      series: ['#1f3a8a', '#7a3fb0', '#0e8aa6', '#d98a2a', '#2e8f5a', '#b3261e', '#4f6fd1', '#6a7390'],
    },
    dark: {
      accent: '#7aa2ff',
      surface: '#0f1730',
      surfaceAlt: '#18244a',
      border: '#7f96d6',
      line: '#9db0e6',
      critical: '#ff8078',
      series: ['#7aa2ff', '#c08cf0', '#4fd0e8', '#f2b55c', '#5fd08f', '#ff8078', '#9db4ff', '#a0a8c0'],
    },
  },
  {
    id: 'autumn',
    name: 'Autumn',
    description: 'Rust, amber and moss.',
    light: {
      accent: '#a8431a',
      surface: '#f9ede4',
      surfaceAlt: '#f1d9c7',
      border: '#a5694a',
      line: '#86503a',
      critical: '#a8201a',
      series: ['#a8431a', '#b8801f', '#6b7f2a', '#7a4a2a', '#3f7f77', '#8f2a3a', '#b8683a', '#7a6a5f'],
    },
    dark: {
      accent: '#f08a55',
      surface: '#33201a',
      surfaceAlt: '#472c22',
      border: '#cf9272',
      line: '#e0ad92',
      critical: '#ff8a80',
      series: ['#f08a55', '#f2b45a', '#b0c85a', '#c99a78', '#5ccbbf', '#f07a8c', '#e0905a', '#b8a89c'],
    },
  },
  {
    id: 'vivid',
    name: 'Vivid',
    description: 'Bright, distinct colours on neutral greys.',
    light: {
      accent: '#1c6fc4',
      surface: '#f4f5f7',
      surfaceAlt: '#e6e8ec',
      border: '#7b848f',
      line: '#4d5560',
      critical: '#d02f2f',
      series: ['#1c6fc4', '#d02f2f', '#2a8a3e', '#d98200', '#6a3fd6', '#0c8599', '#c42b6a', '#495057'],
    },
    dark: {
      accent: '#5aa9ff',
      surface: '#1d2025',
      surfaceAlt: '#2b3036',
      border: '#9aa3ab',
      line: '#ced4da',
      critical: '#ff6b6b',
      series: ['#5aa9ff', '#ff6b6b', '#51cf66', '#ffa94d', '#9775fa', '#3bc9db', '#f06595', '#ced4da'],
    },
  },
  {
    id: 'contrast',
    name: 'High contrast',
    description: 'Black and white with strong colour, for low vision.',
    light: {
      accent: '#0047b3',
      surface: '#ffffff',
      surfaceAlt: '#ececec',
      border: '#000000',
      line: '#000000',
      critical: '#a8001a',
      series: ['#0047b3', '#006b2d', '#8a1c8a', '#8a4b00', '#006b7a', '#a8001a', '#4a4a4a', '#000000'],
    },
    dark: {
      accent: '#7db7ff',
      surface: '#000000',
      surfaceAlt: '#1c1c1c',
      border: '#ffffff',
      line: '#ffffff',
      critical: '#ff7d8f',
      series: ['#7db7ff', '#5fe08a', '#f09af0', '#ffb15c', '#5fd9eb', '#ff7d8f', '#cfcfcf', '#ffffff'],
    },
  },
];

export function themeById(id: string): Theme | undefined {
  return THEMES.find((theme) => theme.id === id);
}

export function isThemeId(id: unknown): id is string {
  return typeof id === 'string' && THEMES.some((theme) => theme.id === id);
}

/** Colours to show as a swatch strip for a theme, for light or dark mode. */
export function swatchColours(theme: Theme | undefined, dark: boolean): string[] {
  const c = theme && (dark ? theme.dark : theme.light);
  // The tint of the background first, so themes that share a hue family still look different.
  if (c) return [c.surfaceAlt, c.accent, ...c.series.slice(1, 4)];
  // Obsidian's own colours, whatever the user's theme is.
  return ['var(--interactive-accent)', 'var(--text-normal)', 'var(--text-muted)', 'var(--background-modifier-border)', 'var(--background-secondary)'];
}

function declarations(c: ThemeColours): string {
  const rows = [
    `--pele-accent: ${c.accent}`,
    `--pele-surface: ${c.surface}`,
    `--pele-surface-alt: ${c.surfaceAlt}`,
    `--pele-border: ${c.border}`,
    `--pele-line: ${c.line}`,
    `--pele-critical: ${c.critical}`,
    // Black or white lettering on filled shapes: one of the two always reaches 4.5:1.
    '--pele-fg-on-light: #000000',
    '--pele-fg-on-dark: #ffffff',
    ...c.series.map((colour, index) => `--pele-series-${index + 1}: ${colour}`),
  ];
  // !important, because Obsidian's own renderer may set these variables on an element inside the diagram.
  return rows.map((row) => `  ${row} !important;`).join('\n');
}

/** The CSS for every theme. Obsidian marks dark mode with `.theme-dark` on the body. */
export function themeCss(): string {
  const out: string[] = [];
  for (const theme of THEMES) {
    if (!theme.light || !theme.dark) continue;
    // The doubled attribute raises specificity above the plain Obsidian defaults, whatever order the style sheets load in.
    out.push(`[data-volcanic-theme="${theme.id}"][data-volcanic-theme] {\n${declarations(theme.light)}\n}`);
    out.push(`.theme-dark [data-volcanic-theme="${theme.id}"][data-volcanic-theme] {\n${declarations(theme.dark)}\n}`);
  }
  // For an editor whose theme has no colours of its own: forget any theme set on the note around it.
  const forget = [...Array.from({ length: 8 }, (_, i) => `--pele-series-${i + 1}`), '--pele-critical', '--pele-fg-on-light', '--pele-fg-on-dark'];
  out.push(`[${NO_THEME_ATTR}][${NO_THEME_ATTR}] {\n${forget.map((name) => `  ${name}: initial !important;`).join('\n')}\n}`);
  return out.join('\n');
}

// ───────────────────────────── Contrast ─────────────────────────────

function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
