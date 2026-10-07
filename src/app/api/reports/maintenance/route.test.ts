import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), build: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/reports/maintenance-report-data", () => ({
  buildMaintenanceReportData: mocks.build,
  getMaintenanceReportOptions: vi.fn(),
  ReportAccessError: class extends Error {},
}));
vi.mock("@/lib/reports/maintenance-report-pdf", () => ({ MaintenanceReportPdf: () => null }));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: vi.fn() }));

import { POST } from "./route";

const report = (startDate: string, endDate = "2026-12-31") =>
  POST(new NextRequest("http://localhost/api/reports/maintenance", {
    method: "POST",
    body: JSON.stringify({ unitIds: [1], startDate, endDate, metrics: ["SUMMARY"] }),
  }));

describe("POST /api/reports/maintenance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ userId: 1, unitId: 1, name: "Analista", role: "MAINTENANCE" });
  });

  it.each(["2026-02-31", "2026-00-10", "2026-13-01", "2026-2-1"])("refuses the impossible date %s", async (date) => {
    const response = await report(date);
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("Informe um período válido.");
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("accepts a real calendar date", async () => {
    mocks.build.mockRejectedValue(new Error("stop after validation"));
    await report("2024-02-29");
    expect(mocks.build).toHaveBeenCalledOnce();
  });
});
