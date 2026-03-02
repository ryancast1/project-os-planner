"use client";

import type { LayoutMode, SavedMarket, TimeRangeLabel, PanelSlot } from "../_lib/types";
import { LAYOUT_CONFIGS } from "../_lib/constants";
import Panel from "./Panel";

export default function PanelGrid({
  layout,
  panels,
  savedMarkets,
  timeRange,
  onChangeMarket,
  onManageMarkets,
}: {
  layout: LayoutMode;
  panels: PanelSlot[];
  savedMarkets: SavedMarket[];
  timeRange: TimeRangeLabel;
  onChangeMarket: (slotIndex: number, marketId: string | null) => void;
  onManageMarkets: () => void;
}) {
  const config = LAYOUT_CONFIGS[layout];
  const compact = config.panelCount >= 4;

  return (
    <div className={`grid ${config.gridClass} gap-2 flex-1 min-h-0`}>
      {Array.from({ length: config.panelCount }, (_, i) => (
        <Panel
          key={i}
          slotIndex={i}
          marketId={panels[i] ?? null}
          savedMarkets={savedMarkets}
          timeRange={timeRange}
          compact={compact}
          onChangeMarket={onChangeMarket}
          onManageMarkets={onManageMarkets}
        />
      ))}
    </div>
  );
}
