export function toLocalDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

export function startOfDay(value: Date | string): Date {
  const date = typeof value === 'string' ? new Date(value) : new Date(value.getTime());
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  return toLocalDate(a) === toLocalDate(b);
}

export function formatFriendlyDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(date);
}
