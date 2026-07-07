import { describe, expect, it } from "vitest";

import { assertCompletionMatchesLocalDate } from "@/domain/completionGuards";

describe("completion guards", () => {
  it("allows a completion when UTC timestamp resolves to the requested local logical date", () => {
    expect(() => {
      assertCompletionMatchesLocalDate(
        "2025-12-31",
        "2026-01-01T02:30:00.000Z",
        "America/Santo_Domingo",
      );
    }).not.toThrow();
  });

  it("rejects a completion that would write the wrong local day", () => {
    expect(() => {
      assertCompletionMatchesLocalDate("2026-01-01", "2026-01-01T02:30:00.000Z", "America/Santo_Domingo");
    }).toThrow("Completion date mismatch");
  });
});
