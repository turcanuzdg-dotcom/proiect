/**
 * CSV compatibil cu Excel: separator „;” (uzual în setările regionale ro-RO/ro-MD), BOM UTF-8
 * pentru diacritice și protecție împotriva injectării de formule (=, +, -, @ la început de celulă).
 */

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
