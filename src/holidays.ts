import Holidays from 'date-holidays';

/** Which country (and, where the country has them, which state or region) a chart takes its holidays from. */
export interface HolidayChoice {
  country: string;
  region: string;
  /** Which days count: 0 public holidays only, 1 also bank and optional holidays, 2 also observances. */
  include?: 0 | 1 | 2;
}

/** The region code for Canada's federal holidays (banks and other federally regulated employers). */
export const CANADA_FEDERAL = 'FED';

export const INCLUDE_LEVELS: { id: '0' | '1' | '2'; name: string }[] = [
  { id: '0', name: 'Public holidays' },
  { id: '1', name: 'Also bank and optional holidays' },
  { id: '2', name: 'Also observances' },
];

export interface Holiday {
  /** Days since 1970-01-01. */
  day: number;
  name: string;
}

/** A holiday and the place it belongs to, for charts that follow teams in several countries. */
export interface PlaceHoliday extends Holiday {
  place: string;
}

const DAY = 86400000;

let countries: { id: string; name: string }[] | null = null;
const regionCache = new Map<string, { id: string; name: string }[]>();

function names(): Record<string, string> {
  return new Holidays().getCountries('en') as Record<string, string>;
}

/** Every country with holiday data, by name. */
export function countryOptions(): { id: string; name: string }[] {
  if (!countries) {
    countries = Object.entries(names())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return countries;
}

/** The states or regions of a country that have their own holidays, or an empty list. */
export function regionOptions(country: string): { id: string; name: string }[] {
  if (!country) return [];
  let found = regionCache.get(country);
  if (!found) {
    const states = new Holidays().getStates(country, 'en') as Record<string, string> | undefined;
    found = states ? Object.entries(states).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)) : [];
    // The library has no federal calendar for Canada, so Volcanic supplies one.
    if (country === 'CA') found = [{ id: CANADA_FEDERAL, name: 'Federal (banks and federally regulated employers)' }, ...found];
    regionCache.set(country, found);
  }
  return found;
}

export function countryName(country: string): string {
  return countryOptions().find((c) => c.id === country)?.name ?? country;
}

export function regionName(country: string, region: string): string {
  return regionOptions(country).find((r) => r.id === region)?.name ?? region;
}

/** "United States, California", or just the country. */
export function placeName(choice: HolidayChoice): string {
  if (choice.country === 'CA' && choice.region === CANADA_FEDERAL) return 'Canada (federal)';
  return choice.region ? `${countryName(choice.country)}, ${regionName(choice.country, choice.region)}` : countryName(choice.country);
}

const calendars = new Map<string, Holidays>();

type HolidayType = 'public' | 'bank' | 'optional' | 'observance';

function typesFor(include: number | undefined): HolidayType[] {
  return include === 2 ? ['public', 'bank', 'optional', 'observance'] : include === 1 ? ['public', 'bank', 'optional'] : ['public'];
}

function calendar(choice: HolidayChoice): Holidays | null {
  const key = `${choice.country}/${choice.region}/${choice.include ?? 0}`;
  let found = calendars.get(key);
  if (!found) {
    try {
      // Public holidays only: the days most people have off.
      const options = { languages: 'en', types: typesFor(choice.include) };
      found = choice.region ? new Holidays(choice.country, choice.region, options) : new Holidays(choice.country, options);
      calendars.set(key, found);
    } catch {
      return null;
    }
  }
  return found;
}

const utcDay = (year: number, month: number, date: number): number => Math.round(Date.UTC(year, month, date) / DAY);
const weekdayOf = (day: number): number => (((day + 4) % 7) + 7) % 7;

/** Easter Sunday for a year (the anonymous Gregorian algorithm). */
function easter(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const date = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDay(year, month, date);
}

/** The nth (1-based) given weekday (0 is Sunday) of a month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = utcDay(year, month, 1);
  return first + ((weekday - weekdayOf(first) + 7) % 7) + (n - 1) * 7;
}

/** General holidays under the Canada Labour Code, which banks and other federally regulated employers follow. */
function canadaFederal(year: number): Holiday[] {
  // Victoria Day is the Monday before May 25.
  let victoria = utcDay(year, 4, 24);
  while (weekdayOf(victoria) !== 1) victoria -= 1;
  return [
    { day: utcDay(year, 0, 1), name: 'New Year’s Day' },
    { day: easter(year) - 2, name: 'Good Friday' },
    { day: victoria, name: 'Victoria Day' },
    { day: utcDay(year, 6, 1), name: 'Canada Day' },
    { day: nthWeekday(year, 8, 1, 1), name: 'Labour Day' },
    { day: utcDay(year, 8, 30), name: 'National Day for Truth and Reconciliation' },
    { day: nthWeekday(year, 9, 1, 2), name: 'Thanksgiving Day' },
    { day: utcDay(year, 10, 11), name: 'Remembrance Day' },
    { day: utcDay(year, 11, 25), name: 'Christmas Day' },
    { day: utcDay(year, 11, 26), name: 'Boxing Day' },
  ];
}

function dayOf(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY) : null;
}

/** Public holidays that fall on days from `from` to `to`, inclusive (days since 1970-01-01). */
export function holidaysBetween(choice: HolidayChoice, from: number, to: number): Holiday[] {
  if (!choice.country || to < from) return [];
  const first = new Date(from * DAY).getUTCFullYear();
  const last = new Date(to * DAY).getUTCFullYear();
  if (choice.country === 'CA' && choice.region === CANADA_FEDERAL) {
    const out: Holiday[] = [];
    for (let year = first; year <= last; year++) out.push(...canadaFederal(year).filter((h) => h.day >= from && h.day <= to));
    return out.sort((a, b) => a.day - b.day);
  }
  const calendarFor = calendar(choice);
  if (!calendarFor) return [];
  const allowed = typesFor(choice.include) as string[];
  const out: Holiday[] = [];
  const seen = new Set<string>();
  for (let year = first; year <= last; year++) {
    for (const holiday of calendarFor.getHolidays(year)) {
      if (!allowed.includes(holiday.type)) continue;
      const day = dayOf(holiday.date);
      if (day === null || day < from || day > to) continue;
      const key = `${day}|${holiday.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ day, name: holiday.name });
    }
  }
  return out.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
}

/** The holidays of several places at once, each tagged with its place. Empty countries are skipped. */
export function holidaysForPlaces(choices: HolidayChoice[], from: number, to: number): PlaceHoliday[] {
  const out: PlaceHoliday[] = [];
  const done = new Set<string>();
  for (const choice of choices) {
    if (!choice.country) continue;
    const key = `${choice.country}/${choice.region}/${choice.include ?? 0}`;
    if (done.has(key)) continue;
    done.add(key);
    const place = placeName(choice);
    for (const holiday of holidaysBetween(choice, from, to)) out.push({ ...holiday, place });
  }
  return out.sort((a, b) => a.day - b.day || a.place.localeCompare(b.place) || a.name.localeCompare(b.name));
}

/** Holidays grouped by place, in the order the places were chosen. */
export function groupByPlace(found: PlaceHoliday[], choices: HolidayChoice[]): { place: string; holidays: PlaceHoliday[] }[] {
  const order = choices.filter((c) => c.country).map((c) => placeName(c));
  const groups = new Map<string, PlaceHoliday[]>();
  for (const place of order) if (!groups.has(place)) groups.set(place, []);
  for (const holiday of found) groups.get(holiday.place)?.push(holiday);
  return Array.from(groups, ([place, holidays]) => ({ place, holidays }));
}

/** How many distinct colours are set aside for countries (see --volcanic-holiday-1 to -12 in styles.css). */
export const HOLIDAY_COLOURS = 12;

/** The CSS colour in a slot (0 to 11). */
export function holidayColour(index: number): string {
  return `var(--volcanic-holiday-${(index % HOLIDAY_COLOURS) + 1}, #e0457f)`;
}

// Colour slots, in the order they are defined in styles.css.
const PINK = 0;
const BLUE = 1;
const GREEN = 2;
const YELLOW = 3;
const RED = 4;
const ORANGE = 5;
const PURPLE = 6;
const TEAL = 7;
const NAVY = 8;
const BROWN = 9;
const LIME = 10;
const SLATE = 11;

/** Colours from each country's flag, most characteristic first. Anything not listed is given a free colour. */
const FLAG_COLOURS: Record<string, number[]> = {
  US: [BLUE, RED],
  CA: [RED],
  MX: [GREEN, RED],
  GT: [BLUE],
  CR: [BLUE, RED],
  PA: [BLUE, RED],
  CU: [BLUE, RED],
  DO: [BLUE, RED],
  CO: [YELLOW, BLUE, RED],
  VE: [YELLOW, BLUE, RED],
  EC: [YELLOW, BLUE, RED],
  PE: [RED],
  BO: [RED, YELLOW, GREEN],
  CL: [NAVY, RED, BLUE],
  AR: [TEAL, BLUE],
  UY: [BLUE],
  PY: [RED, BLUE],
  BR: [GREEN, YELLOW],
  GB: [NAVY, RED],
  IE: [GREEN, ORANGE],
  FR: [BLUE, NAVY, RED],
  DE: [SLATE, RED, YELLOW],
  ES: [RED, YELLOW],
  PT: [GREEN, RED],
  IT: [GREEN, RED],
  NL: [ORANGE, BLUE],
  BE: [YELLOW, SLATE, RED],
  CH: [RED],
  AT: [RED],
  SE: [BLUE, YELLOW],
  NO: [RED, NAVY],
  DK: [RED],
  FI: [BLUE],
  PL: [RED],
  UA: [BLUE, YELLOW],
  GR: [BLUE, NAVY],
  TR: [RED],
  IL: [BLUE],
  SA: [GREEN],
  AE: [GREEN, RED],
  EG: [RED, SLATE],
  ZA: [GREEN, YELLOW],
  NG: [GREEN],
  KE: [GREEN, RED],
  IN: [ORANGE, GREEN],
  PK: [GREEN],
  CN: [RED, YELLOW],
  JP: [RED],
  KR: [BLUE, RED],
  AU: [NAVY, RED],
  NZ: [NAVY, RED],
  PH: [BLUE, RED, YELLOW],
  SG: [RED],
};

/** Used when a country's own colours are all taken. */
const FALLBACK_ORDER = [PINK, ORANGE, PURPLE, TEAL, BROWN, LIME, SLATE, BLUE, GREEN, YELLOW, RED, NAVY];

/**
 * Each place's colour slot. A country gets a colour from its flag (the United States blue, Mexico green…);
 * where two countries want the same one, the later takes its next flag colour, or a free colour.
 */
export function placeIndexes(choices: HolidayChoice[]): Map<string, number> {
  const slots = new Map<string, number>();
  const used = new Set<number>();
  for (const choice of choices) {
    if (!choice.country) continue;
    const place = placeName(choice);
    if (slots.has(place)) continue;
    const slot = [...(FLAG_COLOURS[choice.country] ?? []), ...FALLBACK_ORDER].find((candidate) => !used.has(candidate));
    // More places than colours: start sharing.
    const chosen = slot ?? slots.size % HOLIDAY_COLOURS;
    slots.set(place, chosen);
    used.add(chosen);
  }
  return slots;
}
