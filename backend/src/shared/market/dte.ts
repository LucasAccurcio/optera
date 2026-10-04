export type DteStatus = 'expired' | 'critical' | 'alert' | 'attention' | 'normal';

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date;
}

function utcDateOnly(value: Date): Date | null {
  if (Number.isNaN(value.getTime())) return null;
  return parseDateOnly(value.toISOString().slice(0, 10));
}

export function calculateDte(currentDate: Date, expirationDate: string): number | null {
  const today = utcDateOnly(currentDate);
  const expiration = parseDateOnly(expirationDate);
  if (today === null || expiration === null) return null;
  if (expiration.getTime() <= today.getTime()) return 0;

  let dte = 0;
  const cursor = new Date(today);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getTime() <= expiration.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dte += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dte;
}

export function getDteStatus(dte: number | null): DteStatus | null {
  if (dte === null) return null;
  if (dte <= 0) return 'expired';
  if (dte <= 3) return 'critical';
  if (dte <= 7) return 'alert';
  if (dte <= 15) return 'attention';
  return 'normal';
}

export function getDteLabel(dte: number | null): string {
  const status = getDteStatus(dte);
  if (dte === null || status === null) return '-';
  if (status === 'expired') return 'VENCIDA';
  return `${dte} ${dte === 1 ? 'dia' : 'dias'} (${status})`;
}
