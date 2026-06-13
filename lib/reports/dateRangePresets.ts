export type DateRangePreset =
  | 'all'
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_year'
  | 'last_week'
  | 'last_month'
  | 'last_year'
  | 'custom';

export type DateRangeValue = {
  from: string;
  to: string;
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeekMonday(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function endOfWeekSunday(date: Date) {
  const start = startOfWeekMonday(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return endOfDay(end);
}

function startOfMonth(date: Date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonth(date: Date) {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function startOfYear(date: Date) {
  return startOfDay(new Date(date.getFullYear(), 0, 1));
}

function endOfYear(date: Date) {
  return endOfDay(new Date(date.getFullYear(), 11, 31));
}

export function getDateRangeForPreset(preset: DateRangePreset, now = new Date()): DateRangeValue | null {
  const today = startOfDay(now);

  switch (preset) {
    case 'all':
      return null;
    case 'today':
      return { from: toDateInputValue(today), to: toDateInputValue(today) };
    case 'this_week':
      return {
        from: toDateInputValue(startOfWeekMonday(today)),
        to: toDateInputValue(endOfWeekSunday(today)),
      };
    case 'this_month':
      return {
        from: toDateInputValue(startOfMonth(today)),
        to: toDateInputValue(endOfMonth(today)),
      };
    case 'this_year':
      return {
        from: toDateInputValue(startOfYear(today)),
        to: toDateInputValue(endOfYear(today)),
      };
    case 'last_week': {
      const lastWeekAnchor = new Date(today);
      lastWeekAnchor.setDate(lastWeekAnchor.getDate() - 7);
      return {
        from: toDateInputValue(startOfWeekMonday(lastWeekAnchor)),
        to: toDateInputValue(endOfWeekSunday(lastWeekAnchor)),
      };
    }
    case 'last_month': {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return {
        from: toDateInputValue(startOfMonth(lastMonth)),
        to: toDateInputValue(endOfMonth(lastMonth)),
      };
    }
    case 'last_year': {
      const lastYear = new Date(today.getFullYear() - 1, 0, 1);
      return {
        from: toDateInputValue(startOfYear(lastYear)),
        to: toDateInputValue(endOfYear(lastYear)),
      };
    }
    case 'custom':
      return {
        from: toDateInputValue(startOfMonth(today)),
        to: toDateInputValue(endOfMonth(today)),
      };
    default:
      return {
        from: toDateInputValue(startOfMonth(today)),
        to: toDateInputValue(endOfMonth(today)),
      };
  }
}

export function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Invalid date, expected YYYY-MM-DD');
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function parseReportDateBounds(from?: string | null, to?: string | null) {
  const hasFrom = Boolean(from?.trim());
  const hasTo = Boolean(to?.trim());

  if (!hasFrom && !hasTo) {
    return { start: null as Date | null, end: null as Date | null, label: 'All dates' };
  }

  const start = hasFrom ? startOfDay(parseDateInput(from!.trim())) : null;
  const end = hasTo ? endOfDay(parseDateInput(to!.trim())) : null;

  if (start && end && start.getTime() > end.getTime()) {
    throw new Error('From date must be on or before to date');
  }

  const label =
    start && end
      ? `${toDateInputValue(start)} to ${toDateInputValue(end)}`
      : start
        ? `From ${toDateInputValue(start)}`
        : `Until ${toDateInputValue(end!)}`;

  return { start, end, label };
}

export const DATE_RANGE_PRESET_OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_week', label: 'Last week' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_year', label: 'Last year' },
  { value: 'custom', label: 'Custom' },
];
