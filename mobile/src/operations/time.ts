export function zonedInput(value: string | number | undefined, timeZone: string) {
  if (!value) return '';
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch { return ''; }
}

export function timeInZone(value: string, timeZone: string) {
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); }
  catch { throw new Error('Choose a valid IANA time zone.'); }
  const wallTime = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallTime)) throw new Error('Choose a valid deployment date and time.');
  // Check both sides of a zone transition; the earliest match is the first
  // occurrence of an ambiguous local time, consistent with recurring schedules.
  const candidates = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = wallTime + hours * 3600000;
    const represented = Date.parse(`${zonedInput(probe, timeZone)}:00Z`);
    if (!Number.isFinite(represented)) throw new Error('Choose a valid IANA time zone.');
    const candidate = wallTime - (represented - probe);
    if (zonedInput(candidate, timeZone) === value) candidates.add(candidate);
  }
  if (!candidates.size) throw new Error('That local time does not exist in this time zone. Choose a time after the clock change.');
  return new Date(Math.min(...candidates)).toISOString();
}

