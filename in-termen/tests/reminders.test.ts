import { describe, expect, it } from "vitest";

import {
  buildReminderPreferences,
  computeSnoozeUntil,
  firstUpcomingReminder,
  generateReminderSchedule,
  groupReminders,
  isReminderDue,
  reminderGroupFor,
  toReminderPayload,
} from "@/lib/reminders/schedule";

const TODAY = "2026-10-03";
const TZ = "Europe/Chisinau";
const ALL = buildReminderPreferences();

describe("buildReminderPreferences", () => {
  it("activează doar pragurile alese", () => {
    expect(buildReminderPreferences([30, 7])).toEqual([
      { daysBefore: 45, enabled: false },
      { daysBefore: 30, enabled: true },
      { daysBefore: 14, enabled: false },
      { daysBefore: 7, enabled: true },
      { daysBefore: 1, enabled: false },
    ]);
  });
});

describe("generateReminderSchedule", () => {
  it("programează toate pragurile pentru un termen îndepărtat, la 09:00 ora Chișinăului", () => {
    const planned = generateReminderSchedule({
      documentTitle: "Pașaport",
      expiryDate: "2027-01-06",
      preferences: ALL,
      today: TODAY,
      timeZone: TZ,
    });
    expect(planned.map((r) => r.remindOn)).toEqual([
      "2026-11-22",
      "2026-12-07",
      "2026-12-23",
      "2026-12-30",
      "2027-01-05",
    ]);
    // Iarna, Chișinăul este la UTC+2.
    expect(planned[0].remindAt).toBe("2026-11-22T07:00:00.000Z");
    expect(planned.every((r) => r.kind === "scheduled" && r.channel === "in_app")).toBe(true);
    expect(planned[0].title).toBe("Pașaport expiră în 45 de zile");
    expect(planned[4].title).toBe("Pașaport expiră mâine");
    expect(planned[0].body).toContain("6 ianuarie 2027");
  });

  it("nu programează retroactiv și adaugă un reminder de recuperare astăzi", () => {
    // RCA: expiră peste 12 zile -> pragurile de 45, 30 și 14 zile au trecut.
    const planned = generateReminderSchedule({
      documentTitle: "RCA automobil",
      expiryDate: "2026-10-15",
      preferences: ALL,
      today: TODAY,
      timeZone: TZ,
    });
    expect(planned.map((r) => [r.remindOn, r.daysBefore, r.kind])).toEqual([
      ["2026-10-03", null, "catch_up"],
      ["2026-10-08", 7, "scheduled"],
      ["2026-10-14", 1, "scheduled"],
    ]);
    expect(planned[0].title).toBe("RCA automobil expiră pe 15 octombrie 2026");
  });

  it("nu dublează reminderul când un prag cade chiar astăzi", () => {
    const planned = generateReminderSchedule({
      documentTitle: "Revizie",
      expiryDate: "2026-10-10",
      preferences: ALL,
      today: TODAY,
      timeZone: TZ,
    });
    expect(planned.map((r) => [r.remindOn, r.kind])).toEqual([
      ["2026-10-03", "scheduled"],
      ["2026-10-09", "scheduled"],
    ]);
  });

  it("pentru un document expirat creează un singur reminder „Termen depășit”", () => {
    const planned = generateReminderSchedule({
      documentTitle: "Verificare anuală detector fum",
      expiryDate: "2026-09-28",
      preferences: ALL,
      today: TODAY,
      timeZone: TZ,
    });
    expect(planned).toHaveLength(1);
    expect(planned[0].kind).toBe("catch_up");
    expect(planned[0].title).toBe("Termen depășit: Verificare anuală detector fum");
    expect(planned[0].body).toContain("28 septembrie 2026");
  });

  it("documentul care expiră astăzi primește „expiră astăzi”", () => {
    const planned = generateReminderSchedule({
      documentTitle: "Vignetă",
      expiryDate: TODAY,
      preferences: ALL,
      today: TODAY,
      timeZone: TZ,
    });
    expect(planned).toHaveLength(1);
    expect(planned[0].title).toBe("Vignetă expiră astăzi");
  });

  it("respectă pragurile dezactivate", () => {
    const planned = generateReminderSchedule({
      documentTitle: "Garanție",
      expiryDate: "2027-05-31",
      preferences: buildReminderPreferences([30]),
      today: TODAY,
      timeZone: TZ,
    });
    expect(planned.map((r) => r.daysBefore)).toEqual([30]);
  });

  it("nu creează nimic fără dată de expirare sau fără praguri active", () => {
    expect(
      generateReminderSchedule({ documentTitle: "Internet", expiryDate: null, preferences: ALL, today: TODAY }),
    ).toEqual([]);
    expect(
      generateReminderSchedule({
        documentTitle: "Pașaport",
        expiryDate: "2027-01-06",
        preferences: buildReminderPreferences([]),
        today: TODAY,
      }),
    ).toEqual([]);
  });

  it("păstrează canalul ales și produce forma pentru baza de date", () => {
    const planned = generateReminderSchedule({
      documentTitle: "Pașaport",
      expiryDate: "2027-01-06",
      preferences: buildReminderPreferences([1]),
      today: TODAY,
      timeZone: TZ,
      channel: "email",
    });
    expect(toReminderPayload(planned)).toEqual([
      {
        title: "Pașaport expiră mâine",
        body: "Data expirării: 6 ianuarie 2027. Verifică termenul și pregătește reînnoirea din timp.",
        remind_at: "2027-01-05T07:00:00.000Z",
        channel: "email",
        days_before: 1,
      },
    ]);
    expect(firstUpcomingReminder(planned)?.remindOn).toBe("2027-01-05");
    expect(firstUpcomingReminder([])).toBeNull();
  });
});

describe("gruparea și amânarea reminderelor", () => {
  const make = (remind_at: string, extra: Partial<{ snoozed_until: string | null; status: string }> = {}) => ({
    remind_at,
    snoozed_until: null,
    status: "pending",
    ...extra,
  });

  it("grupează pe Astăzi / 7 zile / 30 de zile / Mai târziu", () => {
    expect(reminderGroupFor(make("2026-10-01T06:00:00Z"), TODAY, TZ)).toBe("today"); // restant
    expect(reminderGroupFor(make("2026-10-03T06:00:00Z"), TODAY, TZ)).toBe("today");
    expect(reminderGroupFor(make("2026-10-10T06:00:00Z"), TODAY, TZ)).toBe("next7");
    expect(reminderGroupFor(make("2026-10-11T06:00:00Z"), TODAY, TZ)).toBe("next30");
    expect(reminderGroupFor(make("2026-11-02T06:00:00Z"), TODAY, TZ)).toBe("next30");
    expect(reminderGroupFor(make("2026-11-03T07:00:00Z"), TODAY, TZ)).toBe("later");
  });

  it("folosește data amânării și ignoră reminderele finalizate", () => {
    const groups = groupReminders(
      [
        make("2026-10-03T06:00:00Z", { status: "snoozed", snoozed_until: "2026-10-06T06:00:00Z" }),
        make("2026-10-02T06:00:00Z", { status: "completed" }),
        make("2026-10-03T06:00:00Z"),
      ],
      TODAY,
      TZ,
    );
    expect(groups.today).toHaveLength(1);
    expect(groups.next7).toHaveLength(1);
    expect(groups.next30).toHaveLength(0);
    expect(groups.later).toHaveLength(0);
  });

  it("calculează data amânării la ora reminderelor", () => {
    const now = new Date("2026-10-03T10:00:00Z");
    expect(computeSnoozeUntil({ kind: "days", days: 1 }, now, TZ)).toBe("2026-10-04T06:00:00.000Z");
    expect(computeSnoozeUntil({ kind: "days", days: 7 }, now, TZ)).toBe("2026-10-10T06:00:00.000Z");
    expect(computeSnoozeUntil({ kind: "date", date: "2026-11-15" }, now, TZ)).toBe("2026-11-15T07:00:00.000Z");
  });

  it("un reminder este scadent când îi vine momentul", () => {
    const now = new Date("2026-10-03T07:00:00Z");
    expect(isReminderDue(make("2026-10-03T06:00:00Z"), now)).toBe(true);
    expect(isReminderDue(make("2026-10-04T06:00:00Z"), now)).toBe(false);
    expect(isReminderDue(make("2026-10-03T06:00:00Z", { status: "completed" }), now)).toBe(false);
    expect(
      isReminderDue(make("2026-10-03T06:00:00Z", { status: "snoozed", snoozed_until: "2026-10-05T06:00:00Z" }), now),
    ).toBe(false);
  });
});
