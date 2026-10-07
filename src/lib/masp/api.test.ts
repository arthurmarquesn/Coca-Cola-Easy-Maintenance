import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), selection: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/unit-selection", () => ({ getUnitSelection: mocks.selection }));
vi.mock("@/lib/db", () => ({ executeRows: vi.fn() }));

import { MaspApiError, requireMaspContext } from "./api";

describe("requireMaspContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.selection.mockResolvedValue({ selectedUnitIds: [7] });
  });

  it.each([false, true])("forbids a manager (write=%s)", async (write) => {
    mocks.session.mockResolvedValue({ userId: 2, unitId: 7, role: "MANAGER" });
    const error = await requireMaspContext(write).catch((caught) => caught);
    expect(error).toBeInstanceOf(MaspApiError);
    expect(error.status).toBe(403);
    expect(mocks.selection).not.toHaveBeenCalled();
  });

  it("lets an analyst read", async () => {
    mocks.session.mockResolvedValue({ userId: 1, unitId: 7, role: "MAINTENANCE" });
    await expect(requireMaspContext()).resolves.toMatchObject({ selectedUnitIds: [7] });
  });

  it("requires a session", async () => {
    mocks.session.mockResolvedValue(null);
    const error = await requireMaspContext().catch((caught) => caught);
    expect(error.status).toBe(401);
  });
});
