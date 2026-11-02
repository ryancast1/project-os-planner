export function resolveMarketLabel(label: string, polymarketTitle?: string | null): string | null {
  return label.trim() || polymarketTitle?.trim() || null;
}
