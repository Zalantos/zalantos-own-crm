function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDay(date: Date): Date {
  const key = dateKey(date);
  return new Date(`${key}T12:00:00.000Z`);
}

export function addBusinessDays(
  startDate: Date,
  businessDays: number,
  holidayDates: Iterable<Date | string> = [],
): Date {
  if (!Number.isInteger(businessDays) || businessDays <= 0) {
    throw new Error("Los días hábiles deben ser un entero mayor que cero.");
  }

  const holidays = new Set(
    [...holidayDates].map((holiday) =>
      typeof holiday === "string" ? holiday.slice(0, 10) : dateKey(holiday),
    ),
  );
  const cursor = utcDay(startDate);
  let remaining = businessDays;

  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    const isWeekend = day === 0 || day === 6;
    if (!isWeekend && !holidays.has(dateKey(cursor))) remaining -= 1;
  }

  return cursor;
}

// Días hábiles transcurridos después de `from` hasta `to`, inclusive.
export function businessDaysBetween(
  from: Date,
  to: Date,
  holidayDates: Iterable<Date | string> = [],
): number {
  const holidays = new Set(
    [...holidayDates].map((holiday) =>
      typeof holiday === "string" ? holiday.slice(0, 10) : dateKey(holiday),
    ),
  );
  const cursor = utcDay(from);
  const end = utcDay(to);
  let count = 0;
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6 && !holidays.has(dateKey(cursor))) count += 1;
  }
  return count;
}

export function toDateInputValue(date: Date | null | undefined): string {
  return date ? dateKey(date) : "";
}
