import type { PanelSlot, SavedMarket } from "./types";
import { LAYOUT_CONFIGS } from "./constants";

export function createTVPanels(current: PanelSlot[], markets: SavedMarket[]): PanelSlot[] {
  const candidates = [...current, ...markets.map((market) => market.id)];
  const unique = [...new Set(candidates.filter((id): id is string => id !== null))];
  return Array.from({ length: LAYOUT_CONFIGS.TV.panelCount }, (_, i) => unique[i] ?? null);
}
