export const ELECTION_NIGHT_LABEL = "Election Night" as const;
// The 2026 general election is November 3. Eastern is on EST after November 1.
export const ELECTION_DAY_START_TS = Date.parse("2026-11-03T07:00:00-05:00") / 1000;
export const ELECTION_NIGHT_START_TS = Date.parse("2026-11-03T18:00:00-05:00") / 1000;

export function getElectionNightStartTs(nowMs: number = Date.now()): number {
  return nowMs < ELECTION_NIGHT_START_TS * 1000 ? ELECTION_DAY_START_TS : ELECTION_NIGHT_START_TS;
}

export function isElectionNightAvailable(nowMs: number = Date.now()): boolean {
  return nowMs >= ELECTION_DAY_START_TS * 1000;
}
