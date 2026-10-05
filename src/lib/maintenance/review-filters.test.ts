import { describe, expect, it } from "vitest";
import { parseReviewFilters } from "./review-filters";

describe("review filters", () => {
  it.each(["", " "])("does not interpret an empty confidence bound as zero (%j)", (value) => {
    const result = parseReviewFilters(new URLSearchParams({ confidenceMax: value }), [1]);
    expect(result.whereSql).not.toContain("cs.confidence <=");
    expect(result.values).toEqual([1]);
  });
  it("preserves an explicitly requested zero confidence", () => {
    const result = parseReviewFilters(new URLSearchParams({ confidenceMax: "0" }), [1]);
    expect(result.whereSql).toContain("cs.confidence <= ?");
    expect(result.values).toEqual([1, 0]);
  });
  it.each(["2026-02-30", "2026-13-01", "2025-02-29"])("does not send impossible date %s to MySQL", (date) => {
    const result = parseReviewFilters(new URLSearchParams({ dateFrom: date, dateTo: date }), [1]);
    expect(result.whereSql).not.toContain("me.event_date");
    expect(result.values).toEqual([1]);
  });
  it("accepts leap days and keeps unit and search values parameterized", () => {
    const result = parseReviewFilters(new URLSearchParams({ dateFrom: "2024-02-29", search: "' OR 1=1 --" }), [2, 2, -1]);
    expect(result.whereSql).toContain("me.unit_id IN (?)");
    expect(result.whereSql).not.toContain("OR 1=1");
    expect(result.values).toEqual([2, "2024-02-29", ...Array(4).fill("%' OR 1=1 --%")]);
  });
  it("never queries without a valid unit", () => {
    expect(() => parseReviewFilters(new URLSearchParams(), [])).toThrow();
  });
});
