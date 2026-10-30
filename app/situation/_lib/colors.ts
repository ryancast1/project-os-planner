import { COLORS } from "./constants";
import type { Outcome, OutcomeColor, OutcomeColors } from "./types";

export const OUTCOME_COLOR_OPTIONS: { id: OutcomeColor; label: string; color: string }[] = [
  { id: "red", label: "Red (Republican)", color: COLORS[3] },
  { id: "blue", label: "Blue (Democrat)", color: COLORS[1] },
  { id: "green", label: "Green", color: COLORS[0] },
  { id: "yellow", label: "Yellow", color: COLORS[2] },
  { id: "purple", label: "Purple", color: COLORS[4] },
  { id: "pink", label: "Pink", color: COLORS[5] },
  { id: "teal", label: "Teal", color: COLORS[6] },
  { id: "orange", label: "Orange", color: COLORS[7] },
];

export function isOutcomeColor(value: unknown): value is OutcomeColor {
  return OUTCOME_COLOR_OPTIONS.some((option) => option.id === value);
}

export function sanitizeOutcomeColors(value: unknown): OutcomeColors {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([token, color]) => token.length > 0 && isOutcomeColor(color)));
}

function partyLabels(name: string) {
  return {
    democrat: /\(\s*d\s*\)|\bdemocrat(?:ic|s)?\b/i.test(name),
    republican: /\(\s*r\s*\)|\brepublicans?\b/i.test(name),
  };
}

export function getOutcomeColor(
  outcome: Outcome,
  index: number,
  overrides?: OutcomeColors,
  outcomeNames: readonly string[] = [outcome.name],
): string {
  const option = OUTCOME_COLOR_OPTIONS.find((option) => option.id === overrides?.[outcome.tokenId]);
  if (option) return option.color;
  const labels = outcomeNames.map(partyLabels);
  if (labels.filter((label) => label.democrat).length > 1 || labels.filter((label) => label.republican).length > 1)
    return COLORS[index % COLORS.length];
  const { democrat, republican } = partyLabels(outcome.name);
  // An outcome mentioning both parties is ambiguous; retain its palette color.
  if (democrat && !republican) return COLORS[1];
  if (republican && !democrat) return COLORS[3];
  return COLORS[index % COLORS.length];
}

export function getOutcomeColors(
  outcomes: Outcome[],
  overrides?: OutcomeColors,
  outcomeNames: readonly string[] = outcomes.map((outcome) => outcome.name),
): string[] {
  return outcomes.map((outcome, index) => getOutcomeColor(outcome, index, overrides, outcomeNames));
}

function storageKey(userId: string, marketId: string): string {
  return `situation-outcome-colors:${userId}:${marketId}`;
}

export function loadLocalOutcomeColors(userId: string, marketId: string): OutcomeColors | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(userId, marketId));
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return sanitizeOutcomeColors(parsed);
  } catch {
    return null;
  }
}

export function saveLocalOutcomeColors(userId: string, marketId: string, colors: OutcomeColors): boolean {
  try {
    localStorage.setItem(storageKey(userId, marketId), JSON.stringify(sanitizeOutcomeColors(colors)));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalOutcomeColors(userId: string, marketId: string): void {
  try {
    localStorage.removeItem(storageKey(userId, marketId));
  } catch {
    // A successful database save does not depend on local storage being available.
  }
}
