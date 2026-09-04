import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { kstDate, resetReplayState, runFixture, validateNormalizedReading, validateStatus, type ReplayFixture } from "../src/lib/domain";

const fixtureDirectory = join(process.cwd(), "public", "vendor", "t04-real-information-board-public-v1", "fixtures");

async function fixture(file: string) {
  return JSON.parse(await readFile(join(fixtureDirectory, file), "utf8")) as ReplayFixture;
}

async function baseline() {
  let state = resetReplayState();
  state = runFixture(state, await fixture("normal-d1-a.json"));
  state = runFixture(state, await fixture("normal-d1-b.json"));
  return state;
}

describe("T04 state contract", () => {
  it("derives record_date from the Asia/Seoul calendar day", () => {
    expect(kstDate("2026-08-24T14:59:59.000Z")).toBe("2026-08-24");
    expect(kstDate("2026-08-24T15:00:00.000Z")).toBe("2026-08-25");
  });

  it("upserts the same KST day without changing the record id", async () => {
    let state = resetReplayState();
    state = runFixture(state, await fixture("normal-d1-a.json"));
    const firstId = state.daily_readings[0].record_id;
    state = runFixture(state, await fixture("normal-d1-b.json"));
    expect(state.daily_readings).toHaveLength(1);
    expect(state.daily_readings[0].record_id).toBe(firstId);
    expect(state.daily_readings[0].normalized_value).toBe(105);
  });

  it("adds the next date once and recomputes +15", async () => {
    const state = runFixture(await baseline(), await fixture("normal-d2.json"));
    expect(state.daily_readings).toHaveLength(2);
    expect(state.last_comparison).toMatchObject({ direction: "increase", magnitude: 15, signed_delta: 15, unit: "pt" });
    expect(state.status).toEqual({ freshness: "fresh", error_code: "none" });
  });

  it.each([
    ["timeout.json", "timeout"],
    ["auth-401.json", "auth"],
    ["rate-429.json", "rate_limit"],
    ["offline.json", "offline"],
    ["schema-break.json", "schema_error"],
  ])("preserves 105 and one row for %s", async (file, code) => {
    const state = runFixture(await baseline(), await fixture(file));
    expect(state.status).toEqual({ freshness: "stale", error_code: code });
    expect(validateStatus(state.status!)).toBe(true);
    expect(state.current_reading?.normalized_value).toBe(105);
    expect(state.daily_readings).toHaveLength(1);
  });

  it("recovers to fresh/none with exactly one next-date row", async () => {
    const failed = runFixture(await baseline(), await fixture("timeout.json"));
    const recovered = runFixture(failed, await fixture("recover-d2.json"));
    expect(recovered.status).toEqual({ freshness: "fresh", error_code: "none" });
    expect(recovered.daily_readings).toHaveLength(2);
    expect(recovered.daily_readings[1]).toMatchObject({ record_date: "2026-08-25", normalized_value: 120 });
    expect(recovered.last_comparison.signed_delta).toBe(15);
  });

  it("rejects extra or malformed normalized fields", async () => {
    const valid = (await fixture("normal-d1-a.json")).payload;
    expect(() => validateNormalizedReading(valid)).not.toThrow();
    expect(() => validateNormalizedReading({ ...(valid as object), secret: "no" })).toThrow();
  });
});
