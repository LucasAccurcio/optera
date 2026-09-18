export function claimInitialRefresh(ref: { current: boolean }): boolean {
  if (ref.current) return false;
  ref.current = true;
  return true;
}
