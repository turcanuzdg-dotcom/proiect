import { describe, expect, it } from "vitest";

import { getDocumentStatus, statusFromDays, summarizeStatuses } from "@/lib/utils/status";

const TODAY = "2026-10-03";

describe("getDocumentStatus", () => {
  it("marchează ca expirat orice termen dinainte de astăzi", () => {
    expect(getDocumentStatus("2026-10-02", TODAY)).toBe("expired");
    expect(getDocumentStatus("2025-01-01", TODAY)).toBe("expired");
  });

  it("este urgent de astăzi până în 7 zile inclusiv", () => {
    expect(getDocumentStatus("2026-10-03", TODAY)).toBe("urgent");
    expect(getDocumentStatus("2026-10-09", TODAY)).toBe("urgent");
    expect(getDocumentStatus("2026-10-10", TODAY)).toBe("urgent");
  });

  it("urmează între 8 și 30 de zile", () => {
    expect(getDocumentStatus("2026-10-11", TODAY)).toBe("upcoming");
    expect(getDocumentStatus("2026-11-02", TODAY)).toBe("upcoming");
  });

  it("este în regulă după 30 de zile", () => {
    expect(getDocumentStatus("2026-11-03", TODAY)).toBe("safe");
    expect(getDocumentStatus("2028-01-01", TODAY)).toBe("safe");
  });

  it("documentele fără dată nu au termen", () => {
    expect(getDocumentStatus(null, TODAY)).toBe("no_expiry");
    expect(getDocumentStatus(undefined, TODAY)).toBe("no_expiry");
  });

  it("respectă exact pragurile", () => {
    expect(statusFromDays(-1)).toBe("expired");
    expect(statusFromDays(0)).toBe("urgent");
    expect(statusFromDays(7)).toBe("urgent");
    expect(statusFromDays(8)).toBe("upcoming");
    expect(statusFromDays(30)).toBe("upcoming");
    expect(statusFromDays(31)).toBe("safe");
    expect(statusFromDays(null)).toBe("no_expiry");
  });
});

describe("summarizeStatuses", () => {
  it("numără documentele pe statusuri (datele demonstrative)", () => {
    const docs = [
      { expiry_date: "2026-10-15" }, // RCA, 12 zile
      { expiry_date: "2027-01-06" }, // Pașaport, 95 de zile
      { expiry_date: "2026-10-09" }, // Revizie tehnică, 6 zile
      { expiry_date: "2027-05-31" }, // Garanție frigider, 240 de zile
      { expiry_date: null }, // Abonament internet
      { expiry_date: "2028-01-25" }, // Carte de identitate, 480 de zile
      { expiry_date: "2026-09-28" }, // Detector de fum, expirat de 5 zile
    ];
    expect(summarizeStatuses(docs, TODAY)).toEqual({
      expired: 1,
      urgent: 1,
      upcoming: 1,
      safe: 3,
      no_expiry: 1,
      total: 7,
    });
  });
});
