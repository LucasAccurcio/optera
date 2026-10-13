export function normalizeAssetInput(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

export function tickerForAssetSelection(
  asset: string,
  selectedFromSuggestions: boolean,
): string {
  return selectedFromSuggestions ? normalizeAssetInput(asset).slice(0, 4) : "";
}
