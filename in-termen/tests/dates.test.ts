import { describe, expect, it } from "vitest";

import {
  daysUntilExpiry,
  formatDayCount,
  formatExpiryDistance,
  formatRoDate,
  formatRoDateTime,
  isISODate,
  isoDateInTimeZone,
  shiftISODate,
  todayInTimeZone,
  zonedDateTimeToUtcISO,
} from "@/lib/utils/dates";

describe("todayInTimeZone", () => {
  it("folosește data din Chișinău, nu din UTC", () => {
    // 2 oct. 2026, 22:30 UTC = 3 oct. 2026, 01:30 la Chișinău (UTC+3, ora de vară)
    const now = new Date("2026-10-02T22:30:00Z");
    expect(todayInTimeZone("Europe/Chisinau", now)).toBe("2026-10-03");
    expect(todayInTimeZone("UTC", now)).toBe("2026-10-02");
  });

  it("ține cont de ora de iarnă (UTC+2)", () => {
    const now = new Date("2026-12-31T22:30:00Z");
    expect(todayInTimeZone("Europe/Chisinau", now)).toBe("2027-01-01");
    expect(todayInTimeZone("Europe/Chisinau", new Date("2026-12-31T21:30:00Z"))).toBe("2026-12-31");
  });
});

describe("daysUntilExpiry", () => {
  it("calculează zilele calendaristice rămase", () => {
    expect(daysUntilExpiry("2026-10-15", "2026-10-03")).toBe(12);
    expect(daysUntilExpiry("2026-10-03", "2026-10-03")).toBe(0);
    expect(daysUntilExpiry("2026-09-28", "2026-10-03")).toBe(-5);
  });

  it("nu se încurcă la trecerea la ora de iarnă", () => {
    // Ora se schimbă pe 25 octombrie 2026
    expect(daysUntilExpiry("2026-10-26", "2026-10-24")).toBe(2);
  });

  it("trece corect peste ani bisecți", () => {
    expect(daysUntilExpiry("2028-03-01", "2028-02-28")).toBe(2);
  });

  it("întoarce null pentru documentele fără termen", () => {
    expect(daysUntilExpiry(null, "2026-10-03")).toBeNull();
  });
});

describe("formatarea în română", () => {
  it("afișează data ca „3 octombrie 2026”", () => {
    expect(formatRoDate("2026-10-03")).toBe("3 octombrie 2026");
    expect(formatRoDate("2027-01-21")).toBe("21 ianuarie 2027");
  });

  it("afișează ora locală", () => {
    expect(formatRoDateTime("2026-10-03T06:00:00Z", "Europe/Chisinau")).toBe("3 octombrie 2026, 09:00");
  });

  it("acordă corect numeralul cu „zi”", () => {
    expect(formatDayCount(1)).toBe("o zi");
    expect(formatDayCount(2)).toBe("2 zile");
    expect(formatDayCount(19)).toBe("19 zile");
    expect(formatDayCount(20)).toBe("20 de zile");
    expect(formatDayCount(45)).toBe("45 de zile");
    expect(formatDayCount(100)).toBe("100 de zile");
    expect(formatDayCount(105)).toBe("105 zile");
    expect(formatDayCount(120)).toBe("120 de zile");
    expect(formatDayCount(-5)).toBe("5 zile");
  });

  it("descrie distanța până la expirare", () => {
    expect(formatExpiryDistance(0)).toBe("Expiră astăzi");
    expect(formatExpiryDistance(1)).toBe("Expiră mâine");
    expect(formatExpiryDistance(12)).toBe("Expiră în 12 zile");
    expect(formatExpiryDistance(95)).toBe("Expiră în 95 de zile");
    expect(formatExpiryDistance(-1)).toBe("Expirat de ieri");
    expect(formatExpiryDistance(-5)).toBe("Expirat de 5 zile");
    expect(formatExpiryDistance(null)).toBe("Fără termen de expirare");
  });
});

describe("conversii de fus orar", () => {
  it("transformă 09:00 la Chișinău în UTC (vară și iarnă)", () => {
    expect(zonedDateTimeToUtcISO("2026-10-03", 9, "Europe/Chisinau")).toBe("2026-10-03T06:00:00.000Z");
    expect(zonedDateTimeToUtcISO("2026-12-03", 9, "Europe/Chisinau")).toBe("2026-12-03T07:00:00.000Z");
  });

  it("găsește data locală a unui moment", () => {
    expect(isoDateInTimeZone("2026-10-02T21:30:00Z", "Europe/Chisinau")).toBe("2026-10-03");
  });

  it("adaugă și scade zile", () => {
    expect(shiftISODate("2026-10-03", 12)).toBe("2026-10-15");
    expect(shiftISODate("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("isISODate", () => {
  it("acceptă doar date reale", () => {
    expect(isISODate("2026-10-03")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("03.10.2026")).toBe(false);
    expect(isISODate("")).toBe(false);
  });
});
