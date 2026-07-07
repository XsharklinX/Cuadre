import { describe, expect, it } from "vitest";

import {
  calculateGamification,
  calculateHabitXp,
  countEarlyCompletions,
  hasPerfectWeek,
  levelFromXp,
  streakBonus,
} from "@/domain/gamification";
import { makeCompletion, makeHabit } from "@/tests/factories";

describe("streakBonus", () => {
  it("grows by chain-length tiers", () => {
    expect(streakBonus(1)).toBe(0);
    expect(streakBonus(2)).toBe(0);
    expect(streakBonus(3)).toBe(5);
    expect(streakBonus(6)).toBe(5);
    expect(streakBonus(7)).toBe(10);
    expect(streakBonus(13)).toBe(10);
    expect(streakBonus(14)).toBe(15);
    expect(streakBonus(29)).toBe(15);
    expect(streakBonus(30)).toBe(25);
  });
});

describe("levelFromXp", () => {
  it("starts at level 1 with 100 XP to the next level", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 100 });
    expect(levelFromXp(99)).toEqual({ level: 1, xpIntoLevel: 99, xpForNextLevel: 100 });
  });

  it("increases the cost of each level by 50 XP", () => {
    expect(levelFromXp(100)).toEqual({ level: 2, xpIntoLevel: 0, xpForNextLevel: 150 });
    expect(levelFromXp(249)).toEqual({ level: 2, xpIntoLevel: 149, xpForNextLevel: 150 });
    expect(levelFromXp(250)).toEqual({ level: 3, xpIntoLevel: 0, xpForNextLevel: 200 });
  });
});

describe("calculateHabitXp", () => {
  it("awards base XP plus streak bonus per completed due day", () => {
    const habit = makeHabit();
    const completions = [
      makeCompletion("2026-01-01"),
      makeCompletion("2026-01-02"),
      makeCompletion("2026-01-03"),
    ];

    // chains 1, 2, 3 -> 10 + 10 + (10 + 5)
    expect(calculateHabitXp(habit, completions, "2026-01-03")).toBe(35);
  });

  it("awards 100 XP for a 7-day chain", () => {
    const habit = makeHabit();
    const completions = [
      makeCompletion("2026-01-01"),
      makeCompletion("2026-01-02"),
      makeCompletion("2026-01-03"),
      makeCompletion("2026-01-04"),
      makeCompletion("2026-01-05"),
      makeCompletion("2026-01-06"),
      makeCompletion("2026-01-07"),
    ];

    // 2×10 + 4×15 + 1×20
    expect(calculateHabitXp(habit, completions, "2026-01-07")).toBe(100);
  });

  it("resets the chain after a missed due day", () => {
    const habit = makeHabit();
    const completions = [
      makeCompletion("2026-01-01"),
      makeCompletion("2026-01-02"),
      makeCompletion("2026-01-04"),
    ];

    expect(calculateHabitXp(habit, completions, "2026-01-04")).toBe(30);
  });

  it("keeps XP earned before a habit was archived", () => {
    const habit = makeHabit({ status: "archived", archivedAt: "2026-01-03T12:00:00.000Z" });
    const completions = [makeCompletion("2026-01-01"), makeCompletion("2026-01-02")];

    expect(calculateHabitXp(habit, completions, "2026-01-10")).toBe(20);
  });

  it("only counts due days for specific-weekday habits", () => {
    const habit = makeHabit({
      goal: { type: "single", frequency: { type: "specific_weekdays", weekdays: [1] } },
    });
    const completions = [makeCompletion("2026-01-05"), makeCompletion("2026-01-12")];

    // Two consecutive due Mondays -> chains 1, 2
    expect(calculateHabitXp(habit, completions, "2026-01-12")).toBe(20);
  });
});

describe("hasPerfectWeek", () => {
  it("detects a fully completed Monday-to-Sunday week", () => {
    const habit = makeHabit({ createdAt: "2026-01-05T12:00:00.000Z" });
    const completions = [
      makeCompletion("2026-01-05"),
      makeCompletion("2026-01-06"),
      makeCompletion("2026-01-07"),
      makeCompletion("2026-01-08"),
      makeCompletion("2026-01-09"),
      makeCompletion("2026-01-10"),
      makeCompletion("2026-01-11"),
    ];

    expect(hasPerfectWeek([habit], completions, "2026-01-12")).toBe(true);
  });

  it("rejects a week with a missed due day", () => {
    const habit = makeHabit({ createdAt: "2026-01-05T12:00:00.000Z" });
    const completions = [
      makeCompletion("2026-01-05"),
      makeCompletion("2026-01-06"),
      makeCompletion("2026-01-08"),
      makeCompletion("2026-01-09"),
      makeCompletion("2026-01-10"),
      makeCompletion("2026-01-11"),
    ];

    expect(hasPerfectWeek([habit], completions, "2026-01-12")).toBe(false);
  });

  it("ignores the current unfinished week", () => {
    const habit = makeHabit({ createdAt: "2026-01-05T12:00:00.000Z" });
    const completions = [
      makeCompletion("2026-01-05"),
      makeCompletion("2026-01-06"),
      makeCompletion("2026-01-07"),
      makeCompletion("2026-01-08"),
      makeCompletion("2026-01-09"),
    ];

    expect(hasPerfectWeek([habit], completions, "2026-01-09")).toBe(false);
  });
});

describe("countEarlyCompletions", () => {
  it("counts completions before 8 a.m. in their own time zone", () => {
    const early = makeCompletion("2026-01-01", { completedAtUtc: "2026-01-01T10:00:00.000Z" }); // 06:00 local
    const late = makeCompletion("2026-01-02", { completedAtUtc: "2026-01-02T12:00:00.000Z" }); // 08:00 local

    expect(countEarlyCompletions([early, late])).toBe(1);
  });
});

describe("calculateGamification", () => {
  it("aggregates XP, level and unlocked achievements", () => {
    const habit = makeHabit();
    const completions = [
      makeCompletion("2026-01-01"),
      makeCompletion("2026-01-02"),
      makeCompletion("2026-01-03"),
      makeCompletion("2026-01-04"),
      makeCompletion("2026-01-05"),
      makeCompletion("2026-01-06"),
      makeCompletion("2026-01-07"),
    ];

    const snapshot = calculateGamification([habit], completions, "2026-01-07");

    expect(snapshot.totalXp).toBe(100);
    expect(snapshot.level).toBe(2);
    expect(snapshot.bestStreakOverall).toBe(7);
    expect(snapshot.currentStreakOverall).toBe(7);
    expect(snapshot.unlockedAchievements).toContain("first_step");
    expect(snapshot.unlockedAchievements).toContain("streak_3");
    expect(snapshot.unlockedAchievements).toContain("streak_7");
    expect(snapshot.unlockedAchievements).not.toContain("streak_30");
    expect(snapshot.unlockedAchievements).not.toContain("collector_5");
  });

  it("returns an empty baseline without data", () => {
    const snapshot = calculateGamification([], [], "2026-01-07");

    expect(snapshot.totalXp).toBe(0);
    expect(snapshot.level).toBe(1);
    expect(snapshot.unlockedAchievements).toEqual([]);
  });
});
