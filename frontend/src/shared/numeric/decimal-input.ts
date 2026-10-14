const DECIMAL_INPUT_PATTERN = /^\d+(?:[.,]\d{1,6})?$/;

export function normalizeDecimalInput(value: string): string {
  return value.trim().replace(",", ".");
}

export function isValidDecimalInput(value: string): boolean {
  return DECIMAL_INPUT_PATTERN.test(value.trim());
}

export function isDecimalInputBeingEdited(value: string): boolean {
  return /^\d*(?:[.,]\d{0,6})?$/.test(value);
}
