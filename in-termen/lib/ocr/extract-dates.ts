import { isISODate, type ISODate } from "@/lib/utils/dates";

/**
 * Extrage date calendaristice dintr-un text (rezultatul unui OCR) și ghicește data expirării.
 * Funcționează fără niciun serviciu extern; rezultatul trebuie verificat mereu de utilizator.
 */

const RO_MONTHS: Record<string, number> = {
  ianuarie: 1,
  ian: 1,
  februarie: 2,
  feb: 2,
  febr: 2,
  martie: 3,
  mar: 3,
  mart: 3,
  aprilie: 4,
  apr: 4,
  mai: 5,
  iunie: 6,
  iun: 6,
  iulie: 7,
  iul: 7,
  august: 8,
  aug: 8,
  septembrie: 9,
  sep: 9,
  sept: 9,
  octombrie: 10,
  oct: 10,
  noiembrie: 11,
  noi: 11,
  nov: 11,
  decembrie: 12,
  dec: 12,
};

const EXPIRY_KEYWORDS = [
  "valabil pana",
  "valabila pana",
  "valabil pina",
  "valabilitate",
  "data expirarii",
  "expira",
  "expirare",
  "termen de valabilitate",
  "date of expiry",
  "expiry date",
  "valid until",
  "действителен до",
  "срок действия",
];

export interface ExtractedDate {
  date: ISODate;
  index: number;
}

function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function toISO(year: number, month: number, day: number): ISODate | null {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isISODate(iso) ? iso : null;
}

function normalizeYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

export function extractDatesFromText(text: string): ExtractedDate[] {
  const source = stripDiacritics(text).toLowerCase();
  const found: ExtractedDate[] = [];

  // 31.12.2026, 31/12/2026, 31-12-2026, 31.12.26
  for (const m of source.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/g)) {
    const iso = toISO(normalizeYear(Number(m[3])), Number(m[2]), Number(m[1]));
    if (iso) found.push({ date: iso, index: m.index ?? 0 });
  }

  // 2026-12-31
  for (const m of source.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const iso = toISO(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) found.push({ date: iso, index: m.index ?? 0 });
  }

  // 3 octombrie 2026, 3 oct. 2026
  for (const m of source.matchAll(/\b(\d{1,2})\s+([a-z]{3,10})\.?\s+(\d{4})\b/g)) {
    const month = RO_MONTHS[m[2]];
    if (!month) continue;
    const iso = toISO(Number(m[3]), month, Number(m[1]));
    if (iso) found.push({ date: iso, index: m.index ?? 0 });
  }

  const unique = new Map<string, ExtractedDate>();
  for (const item of found.sort((a, b) => a.index - b.index)) {
    const key = `${item.date}@${item.index}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

/**
 * Ghicește data expirării: prima dată care apare după un cuvânt-cheie („valabil până”, „expiră”...),
 * altfel cea mai târzie dată găsită. Întoarce null dacă nu există nicio dată.
 */
export function guessExpiryDate(text: string): ISODate | null {
  const dates = extractDatesFromText(text);
  if (dates.length === 0) return null;
  const source = stripDiacritics(text).toLowerCase();

  for (const rawKeyword of EXPIRY_KEYWORDS) {
    const keyword = stripDiacritics(rawKeyword);
    let position = source.indexOf(keyword);
    while (position !== -1) {
      const next = dates.find((d) => d.index >= position && d.index - position <= 80);
      if (next) return next.date;
      position = source.indexOf(keyword, position + keyword.length);
    }
  }

  return dates.reduce((latest, d) => (d.date > latest ? d.date : latest), dates[0].date);
}
