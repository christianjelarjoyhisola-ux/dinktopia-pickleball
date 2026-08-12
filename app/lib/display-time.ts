export function formatClock12(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return value;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}${minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`} ${period}`;
}

export function formatClockRange12(startsAt: string, endsAt: string) {
  return `${formatClock12(startsAt)}–${formatClock12(endsAt)}`;
}
