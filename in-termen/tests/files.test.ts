import { describe, expect, it } from "vitest";

import { guessExpiryDate, extractDatesFromText } from "@/lib/ocr/extract-dates";
import { buildStoragePath, formatFileSize, isOwnStoragePath, sanitizeFileName, validateFile } from "@/lib/utils/files";
import { formatMoney, parseAmount } from "@/lib/utils/money";

const MB = 1024 * 1024;
const USER = "8f14e45f-ceea-467f-a0e6-0a1b2c3d4e5f";

describe("validateFile", () => {
  it("acceptă PDF, JPG, JPEG și PNG", () => {
    expect(validateFile({ name: "rca.pdf", type: "application/pdf", size: MB }, 10 * MB)).toEqual({
      ok: true,
      mimeType: "application/pdf",
    });
    expect(validateFile({ name: "Poza.JPG", type: "image/jpeg", size: MB }, 10 * MB).ok).toBe(true);
    expect(validateFile({ name: "scan.jpeg", type: "image/jpeg", size: MB }, 10 * MB).ok).toBe(true);
    expect(validateFile({ name: "scan.png", type: "image/png", size: MB }, 10 * MB).ok).toBe(true);
  });

  it("acceptă fișierele fără tip raportat, după extensie", () => {
    expect(validateFile({ name: "scan.png", type: "", size: MB }, 10 * MB)).toEqual({
      ok: true,
      mimeType: "image/png",
    });
  });

  it("respinge alte tipuri, nepotrivirile și fișierele goale", () => {
    expect(validateFile({ name: "act.docx", type: "application/msword", size: MB }, 10 * MB).ok).toBe(false);
    expect(validateFile({ name: "virus.pdf", type: "application/x-msdownload", size: MB }, 10 * MB).ok).toBe(false);
    expect(validateFile({ name: "poza.png", type: "image/jpeg", size: MB }, 10 * MB).ok).toBe(false);
    expect(validateFile({ name: "gol.pdf", type: "application/pdf", size: 0 }, 10 * MB).ok).toBe(false);
  });

  it("respinge fișierele peste limita configurată, cu mesaj în română", () => {
    const result = validateFile({ name: "mare.pdf", type: "application/pdf", size: 6 * MB }, 5 * MB);
    expect(result).toEqual({ ok: false, error: "Fișierul este prea mare. Limita este 5 MB." });
  });
});

describe("numele și căile fișierelor", () => {
  it("curăță diacriticele și caracterele speciale", () => {
    expect(sanitizeFileName("Poliță RCA (2026).PDF")).toBe("polita-rca-2026.pdf");
    expect(sanitizeFileName("ș ț ă î â.png")).toBe("s-t-a-i-a.png");
    expect(sanitizeFileName("###.pdf")).toBe("document.pdf");
  });

  it("pune fișierul în dosarul utilizatorului", () => {
    expect(buildStoragePath(USER, "Pașaport.jpg", "abc")).toBe(`${USER}/abc-pasaport.jpg`);
  });

  it("acceptă doar căi din propriul dosar", () => {
    expect(isOwnStoragePath(`${USER}/abc-rca.pdf`, USER)).toBe(true);
    expect(isOwnStoragePath(`alt-user/abc-rca.pdf`, USER)).toBe(false);
    expect(isOwnStoragePath(`${USER}/../alt/rca.pdf`, USER)).toBe(false);
    expect(isOwnStoragePath(`${USER}/`, USER)).toBe(false);
  });

  it("afișează dimensiunea lizibil", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1.5 * MB)).toBe("1,5 MB");
  });
});

describe("sume", () => {
  it("formatează în MDL implicit", () => {
    expect(formatMoney(250, "MDL").replace(/\s/g, " ")).toBe("250,00 MDL");
    expect(formatMoney(1234.5, "EUR").replace(/\s/g, " ")).toMatch(/^1\.?234,50 EUR$/);
  });

  it("citește sumele scrise cu virgulă sau punct", () => {
    expect(parseAmount("250")).toBe(250);
    expect(parseAmount("250,5")).toBe(250.5);
    expect(parseAmount("250.50")).toBe(250.5);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("extragerea datelor din text (OCR)", () => {
  it("găsește formatele uzuale", () => {
    const dates = extractDatesFromText("Emis 03.10.2020, valabil până la 2 octombrie 2030. Ref 2026-01-15");
    expect(dates.map((d) => d.date)).toEqual(["2020-10-03", "2030-10-02", "2026-01-15"]);
  });

  it("preferă data de lângă „valabil până”", () => {
    expect(guessExpiryDate("Data emiterii: 01.02.2026\nValabil până la: 31.01.2027\nAlte date: 15.05.2030")).toBe(
      "2027-01-31",
    );
    expect(guessExpiryDate("Действителен до 12/05/2031")).toBe("2031-05-12");
  });

  it("altfel alege cea mai târzie dată, iar fără date întoarce null", () => {
    expect(guessExpiryDate("01.01.2026 și 01.06.2028")).toBe("2028-06-01");
    expect(guessExpiryDate("fără nicio dată")).toBeNull();
    expect(extractDatesFromText("31.02.2026")).toEqual([]);
  });
});

describe("exportul CSV", () => {
  it("escapează separatorul, ghilimelele și formulele", async () => {
    const { escapeCsvCell, toCsv } = await import("@/lib/utils/csv");
    expect(escapeCsvCell("RCA; auto")).toBe('"RCA; auto"');
    expect(escapeCsvCell('Spune "da"')).toBe('"Spune ""da"""');
    expect(escapeCsvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(12.5)).toBe("12.5");
    expect(toCsv(["Titlu", "Sumă"], [["Pașaport", 250]])).toBe("﻿Titlu;Sumă\r\nPașaport;250\r\n");
  });
});
