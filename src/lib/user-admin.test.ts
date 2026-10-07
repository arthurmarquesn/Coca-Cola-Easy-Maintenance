import { describe, expect, it } from "vitest";

import { parseUnitIdList, planUnitLinks } from "./user-admin";

const base = {
  currentUnitIds: [] as number[],
  currentPrimaryUnitId: null,
  actorUnitIds: [1, 2, 3],
};

describe("planUnitLinks", () => {
  it("gives a manager only the primary unit", () => {
    expect(planUnitLinks({ ...base, role: "MANAGER", primaryUnitId: 1, extraUnitIds: undefined }))
      .toEqual({ ok: true, primaryUnitId: 1, unitIds: [1] });
  });

  it("refuses extra units for a manager", () => {
    const plan = planUnitLinks({ ...base, role: "MANAGER", primaryUnitId: 1, extraUnitIds: [2] });
    expect(plan.ok).toBe(false);
  });

  it("drops a manager's legacy extra links", () => {
    const plan = planUnitLinks({
      ...base, role: "MANAGER", primaryUnitId: 1, extraUnitIds: undefined,
      currentUnitIds: [1, 2, 9], currentPrimaryUnitId: 1,
    });
    expect(plan).toEqual({ ok: true, primaryUnitId: 1, unitIds: [1] });
  });

  it("refuses a primary unit outside the actor's units", () => {
    const plan = planUnitLinks({ ...base, role: "MAINTENANCE", primaryUnitId: 9, extraUnitIds: [] });
    expect(plan).toMatchObject({ ok: false, status: 403 });
  });

  it("keeps an unchanged primary unit outside the actor's units", () => {
    const plan = planUnitLinks({
      ...base, role: "MAINTENANCE", primaryUnitId: 9, extraUnitIds: [2],
      currentUnitIds: [9, 1], currentPrimaryUnitId: 9,
    });
    expect(plan).toEqual({ ok: true, primaryUnitId: 9, unitIds: [2, 9] });
  });

  it("refuses extra units outside the actor's units", () => {
    const plan = planUnitLinks({ ...base, role: "MAINTENANCE", primaryUnitId: 1, extraUnitIds: [2, 9] });
    expect(plan).toMatchObject({ ok: false, status: 403 });
  });

  it("keeps links the actor cannot see and current extras when none are sent", () => {
    const plan = planUnitLinks({
      ...base, role: "MAINTENANCE", primaryUnitId: 1, extraUnitIds: undefined,
      currentUnitIds: [1, 3, 9], currentPrimaryUnitId: 1,
    });
    expect(plan).toEqual({ ok: true, primaryUnitId: 1, unitIds: [1, 3, 9] });
  });

  it("replaces the visible extras with the ones sent", () => {
    const plan = planUnitLinks({
      ...base, role: "MAINTENANCE", primaryUnitId: 2, extraUnitIds: [3],
      currentUnitIds: [1, 9], currentPrimaryUnitId: 1,
    });
    expect(plan).toEqual({ ok: true, primaryUnitId: 2, unitIds: [2, 3, 9] });
  });
});

describe("parseUnitIdList", () => {
  it("accepts positive integers and removes duplicates", () => {
    expect(parseUnitIdList([1, 2, 2])).toEqual([1, 2]);
  });

  it("rejects anything else", () => {
    expect(parseUnitIdList("1,2")).toBeNull();
    expect(parseUnitIdList([1, "2"])).toBeNull();
    expect(parseUnitIdList([0])).toBeNull();
    expect(parseUnitIdList([1.5])).toBeNull();
  });
});
