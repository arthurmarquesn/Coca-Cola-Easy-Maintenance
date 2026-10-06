import { describe, expect, it } from "vitest";

import {
  buildProblemCategoryCaseSql,
  deriveProblemCategorySlug,
} from "./problem-categories";

const slug = (failedComponentCode: string, failureMode = "") =>
  deriveProblemCategorySlug({ failedComponentCode, failureMode, observation: "" });

describe("problem categories", () => {
  it("keeps legacy component codes", () => {
    expect(slug("SENSOR")).toBe("sensores");
    expect(slug("MOTOR")).toBe("motores");
  });

  it("finds the component inside Ursus failure-mode codes", () => {
    expect(slug("FALHA_DE_SENSOR")).toBe("sensores");
    expect(slug("ESCAPE_DE_ESTEIRA")).toBe("transporte");
    expect(slug("FALHA_DE_VALVULA_DE_ENCHIMENTO")).toBe("valvulas");
    expect(slug("FALHA_DE_COMUNICACAO")).toBe("eletricos");
  });

  it("matches whole tokens only", () => {
    expect(slug("FALHA_DE_MOTORISTA")).toBe("outros");
    expect(slug("QUEDA_DE_GARRAFAS")).toBe("outros");
  });

  it("emits token checks in SQL instead of exact equality", () => {
    const sql = buildProblemCategoryCaseSql();
    expect(sql).toContain("'_SENSOR_'");
    expect(sql).not.toContain("failed_component_code IN");
  });
});
