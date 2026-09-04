import type { ReplayFixture } from "@/lib/domain";

export const FIXTURE_ROOT = "/vendor/t04-real-information-board-public-v1";
export const PACKAGE_ID = "aleph-t04-real-information-board-public-contract-v2";
export const PACKAGE_ZIP_SHA256 = "ca123fc72b1b15e83d4fe3c9aab5189496eda489c2a06efe55049c0aa57ac899";

const FIXTURE_FILES = {
  "T04-NORMAL-D1-A": "normal-d1-a.json",
  "T04-NORMAL-D1-B": "normal-d1-b.json",
  "T04-NORMAL-D2": "normal-d2.json",
  "T04-TIMEOUT": "timeout.json",
  "T04-AUTH-401": "auth-401.json",
  "T04-RATE-429": "rate-429.json",
  "T04-OFFLINE": "offline.json",
  "T04-SCHEMA-BREAK": "schema-break.json",
  "T04-RECOVER-D2": "recover-d2.json",
} as const;

export type FixtureId = keyof typeof FIXTURE_FILES;

export async function loadFixture(id: FixtureId): Promise<ReplayFixture> {
  const response = await fetch(`${FIXTURE_ROOT}/fixtures/${FIXTURE_FILES[id]}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`fixture load failed: ${id}`);
  return (await response.json()) as ReplayFixture;
}

export async function runFixtureSequence(ids: FixtureId[]) {
  return Promise.all(ids.map(loadFixture));
}
