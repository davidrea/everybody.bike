import { describe, it, expect } from "vitest";
import {
  buildRRule,
  parseRRule,
  generateOccurrences,
  humanizeRRule,
} from "../recurrence";

describe("buildRRule", () => {
  it("builds a weekly rule", () => {
    const rule = buildRRule({ frequency: "weekly" });
    expect(rule).toContain("FREQ=WEEKLY");
    expect(rule).not.toContain("INTERVAL=");
  });

  it("builds a biweekly rule with interval=2", () => {
    const rule = buildRRule({ frequency: "biweekly" });
    expect(rule).toContain("FREQ=WEEKLY");
    expect(rule).toContain("INTERVAL=2");
  });

  it("builds a monthly rule", () => {
    const rule = buildRRule({ frequency: "monthly" });
    expect(rule).toContain("FREQ=MONTHLY");
  });

  it("includes BYDAY when dayOfWeek is specified", () => {
    const rule = buildRRule({ frequency: "weekly", dayOfWeek: 5 }); // Saturday (0=Mo)
    expect(rule).toContain("BYDAY=SA");
  });

  it("includes UNTIL when specified", () => {
    const rule = buildRRule({
      frequency: "weekly",
      until: "2026-06-30T00:00:00Z",
    });
    expect(rule).toContain("UNTIL=");
  });

  it("includes COUNT when specified and no UNTIL", () => {
    const rule = buildRRule({ frequency: "weekly", count: 10 });
    expect(rule).toContain("COUNT=10");
  });

  it("prefers UNTIL over COUNT when both specified", () => {
    const rule = buildRRule({
      frequency: "weekly",
      until: "2026-06-30T00:00:00Z",
      count: 10,
    });
    expect(rule).toContain("UNTIL=");
    expect(rule).not.toContain("COUNT=");
  });

  it("maps dayOfWeek 0 to Monday", () => {
    const rule = buildRRule({ frequency: "weekly", dayOfWeek: 0 });
    expect(rule).toContain("BYDAY=MO");
  });

  it("maps dayOfWeek 6 to Sunday", () => {
    const rule = buildRRule({ frequency: "weekly", dayOfWeek: 6 });
    expect(rule).toContain("BYDAY=SU");
  });
});

describe("parseRRule", () => {
  it("parses a weekly rule", () => {
    const opts = parseRRule("FREQ=WEEKLY");
    expect(opts.frequency).toBe("weekly");
  });

  it("parses a biweekly rule (interval=2)", () => {
    const opts = parseRRule("FREQ=WEEKLY;INTERVAL=2");
    expect(opts.frequency).toBe("biweekly");
  });

  it("parses a monthly rule", () => {
    const opts = parseRRule("FREQ=MONTHLY");
    expect(opts.frequency).toBe("monthly");
  });

  it("parses BYDAY to dayOfWeek", () => {
    const opts = parseRRule("FREQ=WEEKLY;BYDAY=WE");
    expect(opts.dayOfWeek).toBe(2); // Wednesday = index 2
  });

  it("parses UNTIL", () => {
    const opts = parseRRule("FREQ=WEEKLY;UNTIL=20260630T000000Z");
    expect(opts.until).toBeDefined();
    expect(new Date(opts.until!).getFullYear()).toBe(2026);
  });

  it("parses COUNT", () => {
    const opts = parseRRule("FREQ=WEEKLY;COUNT=10");
    expect(opts.count).toBe(10);
  });

  it("returns undefined dayOfWeek when no BYDAY", () => {
    const opts = parseRRule("FREQ=WEEKLY");
    expect(opts.dayOfWeek).toBeUndefined();
  });

  it("normalizes 3-letter day aliases (MON → MO)", () => {
    const opts = parseRRule("FREQ=WEEKLY;BYDAY=MON");
    expect(opts.dayOfWeek).toBe(0); // Monday
  });
});

describe("buildRRule → parseRRule round-trip", () => {
  it("round-trips a weekly rule with dayOfWeek", () => {
    const original = { frequency: "weekly" as const, dayOfWeek: 3 };
    const rule = buildRRule(original);
    const parsed = parseRRule(rule);
    expect(parsed.frequency).toBe(original.frequency);
    expect(parsed.dayOfWeek).toBe(original.dayOfWeek);
  });

  it("round-trips a biweekly rule", () => {
    const original = { frequency: "biweekly" as const, dayOfWeek: 1 };
    const rule = buildRRule(original);
    const parsed = parseRRule(rule);
    expect(parsed.frequency).toBe("biweekly");
    expect(parsed.dayOfWeek).toBe(1);
  });

  it("round-trips a monthly rule", () => {
    const original = { frequency: "monthly" as const };
    const rule = buildRRule(original);
    const parsed = parseRRule(rule);
    expect(parsed.frequency).toBe("monthly");
  });

  it("round-trips COUNT", () => {
    const original = { frequency: "weekly" as const, count: 8 };
    const rule = buildRRule(original);
    const parsed = parseRRule(rule);
    expect(parsed.count).toBe(8);
  });
});

describe("generateOccurrences", () => {
  it("generates weekly occurrences within a range", () => {
    const startDate = new Date("2026-03-01T10:00:00Z");
    const rangeEnd = new Date("2026-04-01T10:00:00Z"); // ~4 weeks

    const occurrences = generateOccurrences("FREQ=WEEKLY", startDate, rangeEnd);
    // Should get 4-5 weekly occurrences in ~31 days
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
    expect(occurrences.length).toBeLessThanOrEqual(5);
  });

  it("respects COUNT limit", () => {
    const startDate = new Date("2026-03-01T10:00:00Z");
    const rangeEnd = new Date("2026-12-31T10:00:00Z");

    const occurrences = generateOccurrences("FREQ=WEEKLY;COUNT=3", startDate, rangeEnd);
    expect(occurrences).toHaveLength(3);
  });

  it("generates biweekly occurrences", () => {
    const startDate = new Date("2026-03-01T10:00:00Z");
    const rangeEnd = new Date("2026-04-01T10:00:00Z"); // ~4 weeks

    const occurrences = generateOccurrences(
      "FREQ=WEEKLY;INTERVAL=2",
      startDate,
      rangeEnd
    );
    // Biweekly over 4 weeks = 2-3 occurrences
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
    expect(occurrences.length).toBeLessThanOrEqual(3);
  });

  it("defaults to 6-month range when no rangeEnd provided", () => {
    const startDate = new Date("2026-03-01T10:00:00Z");

    const occurrences = generateOccurrences("FREQ=MONTHLY", startDate);
    // Monthly over ~6 months = 6-7 occurrences
    expect(occurrences.length).toBeGreaterThanOrEqual(6);
    expect(occurrences.length).toBeLessThanOrEqual(7);
  });

  it("all occurrences are within the specified range", () => {
    const startDate = new Date("2026-03-01T10:00:00Z");
    const rangeEnd = new Date("2026-04-01T10:00:00Z");

    const occurrences = generateOccurrences("FREQ=WEEKLY", startDate, rangeEnd);
    for (const occ of occurrences) {
      expect(occ.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
      expect(occ.getTime()).toBeLessThanOrEqual(rangeEnd.getTime());
    }
  });
});

describe("humanizeRRule", () => {
  it("converts weekly rule to human-readable text", () => {
    const text = humanizeRRule("FREQ=WEEKLY");
    expect(text.toLowerCase()).toContain("every week");
  });

  it("converts biweekly rule to human-readable text", () => {
    const text = humanizeRRule("FREQ=WEEKLY;INTERVAL=2");
    expect(text.toLowerCase()).toContain("every 2 weeks");
  });

  it("converts monthly rule to human-readable text", () => {
    const text = humanizeRRule("FREQ=MONTHLY");
    expect(text.toLowerCase()).toContain("every month");
  });

  it("returns original string for unparseable rules", () => {
    const garbage = "NOT_A_VALID_RRULE";
    const text = humanizeRRule(garbage);
    expect(text).toBe(garbage);
  });
});
