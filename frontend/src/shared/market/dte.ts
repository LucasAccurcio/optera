const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function calculateDte(currentDate: Date, expirationDate: string): number | null {
  const expiration = parseDateOnly(expirationDate);
  if (!expiration || Number.isNaN(currentDate.getTime())) return null;

  const today = Date.UTC(
    currentDate.getUTCFullYear(),
    currentDate.getUTCMonth(),
    currentDate.getUTCDate(),
  );
  if (expiration <= today) return 0;

  let businessDays = 0;
  for (let date = today + DAY_IN_MS; date <= expiration; date += DAY_IN_MS) {
    const weekday = new Date(date).getUTCDay();
    if (weekday !== 0 && weekday !== 6) businessDays += 1;
  }
  return businessDays;
}

function parseDateOnly(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}
