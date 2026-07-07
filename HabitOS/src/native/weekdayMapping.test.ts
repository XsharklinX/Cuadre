import { describe, expect, it } from "vitest";

import { isoWeekdayToExpoWeekday } from "@/native/weekdayMapping";

describe("isoWeekdayToExpoWeekday", () => {
  it("maps ISO Monday..Sunday (1..7) to Expo's Sunday..Saturday (1..7)", () => {
    expect(isoWeekdayToExpoWeekday(1)).toBe(2); // Monday -> 2
    expect(isoWeekdayToExpoWeekday(6)).toBe(7); // Saturday -> 7
    expect(isoWeekdayToExpoWeekday(7)).toBe(1); // Sunday -> 1
  });
});
