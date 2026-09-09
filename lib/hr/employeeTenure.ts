function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  const expectedMonth = ((targetMonth % 12) + 12) % 12;
  if (d.getMonth() !== expectedMonth) {
    d.setDate(0);
  }
  return d;
}

function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}

function parseDateParts(
  value: string | Date | null | undefined
): { year: number; month: number; date: number } | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      year: value.getFullYear(),
      month: value.getMonth(),
      date: value.getDate(),
    };
  }
  if (typeof value !== 'string') return null;
  const str = value.trim();
  if (!str) return null;

  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return {
      year: parseInt(match[1], 10),
      month: parseInt(match[2], 10) - 1,
      date: parseInt(match[3], 10),
    };
  }

  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    date: d.getDate(),
  };
}

export type TenureOptions = {
  terminationDate?: string | Date | null;
  status?: string | null;
  referenceDate?: Date;
};

export type EmployeeTenure = {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  isFuture: boolean;
  isExited: boolean;
};

/**
 * Computes exact calendar tenure (years, months, days) between hire date and reference date or exit/termination date.
 */
export function computeEmployeeTenure(
  hire: string | Date | null | undefined,
  optionsOrRefDate?: TenureOptions | Date
): EmployeeTenure | null {
  const startParts = parseDateParts(hire);
  if (!startParts) return null;

  let terminationDate: string | Date | null | undefined;
  let status: string | null | undefined;
  let referenceDate = new Date();

  if (optionsOrRefDate instanceof Date) {
    referenceDate = optionsOrRefDate;
  } else if (optionsOrRefDate && typeof optionsOrRefDate === 'object') {
    terminationDate = optionsOrRefDate.terminationDate;
    status = optionsOrRefDate.status;
    if (optionsOrRefDate.referenceDate instanceof Date) {
      referenceDate = optionsOrRefDate.referenceDate;
    }
  }

  const refParts = parseDateParts(referenceDate) ?? {
    year: referenceDate.getFullYear(),
    month: referenceDate.getMonth(),
    date: referenceDate.getDate(),
  };

  const start = new Date(startParts.year, startParts.month, startParts.date);
  const ref = new Date(refParts.year, refParts.month, refParts.date);

  const termParts = parseDateParts(terminationDate);
  const term = termParts ? new Date(termParts.year, termParts.month, termParts.date) : null;

  const isExitedStatus = status?.toUpperCase() === 'EXITED';

  let end: Date;
  let isExited = false;

  if (term) {
    if (term.getTime() <= ref.getTime() || isExitedStatus) {
      end = term;
      isExited = true;
    } else {
      // Future termination date, still active today
      end = ref;
      isExited = false;
    }
  } else if (isExitedStatus) {
    end = ref;
    isExited = true;
  } else {
    end = ref;
    isExited = false;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.round((end.getTime() - start.getTime()) / dayMs);

  if (totalDays < 0) {
    if (!isExited && start.getTime() > ref.getTime()) {
      const daysUntilStart = Math.round((start.getTime() - ref.getTime()) / dayMs);
      return {
        years: 0,
        months: 0,
        days: daysUntilStart,
        totalDays: -daysUntilStart,
        isFuture: true,
        isExited: false,
      };
    }
    return {
      years: 0,
      months: 0,
      days: 0,
      totalDays: 0,
      isFuture: false,
      isExited,
    };
  }

  let current = start;
  let years = 0;
  while (true) {
    const next = addYears(start, years + 1);
    if (next.getTime() <= end.getTime()) {
      years++;
      current = next;
    } else {
      break;
    }
  }

  let months = 0;
  while (true) {
    const next = addMonths(current, months + 1);
    if (next.getTime() <= end.getTime()) {
      months++;
    } else {
      break;
    }
  }

  const afterMonths = addMonths(current, months);
  const days = Math.round((end.getTime() - afterMonths.getTime()) / dayMs);

  return {
    years,
    months,
    days,
    totalDays,
    isFuture: false,
    isExited,
  };
}

/**
 * Formats actual tenure label (e.g. "1 day with company", "5 days with company", "1 mo. 3 days with company", "2 yrs. 1 mo. with company").
 */
export function tenureLabel(
  hire: string | Date | null | undefined,
  optionsOrRefDate?: TenureOptions | Date
): string | null {
  const tenure = computeEmployeeTenure(hire, optionsOrRefDate);
  if (!tenure) return null;

  if (tenure.isFuture) {
    if (tenure.days === 1) return 'Starts tomorrow';
    return `Starts in ${tenure.days} days`;
  }

  if (tenure.totalDays === 0) {
    if (tenure.isExited) {
      return '1 day with company';
    }
    return 'Joined today';
  }

  const parts: string[] = [];
  if (tenure.years > 0) {
    parts.push(`${tenure.years} ${tenure.years === 1 ? 'yr.' : 'yrs.'}`);
  }
  if (tenure.months > 0) {
    parts.push(`${tenure.months} ${tenure.months === 1 ? 'mo.' : 'mos.'}`);
  }
  if (tenure.days > 0) {
    parts.push(`${tenure.days} ${tenure.days === 1 ? 'day' : 'days'}`);
  }

  if (parts.length === 0) {
    return tenure.isExited ? '1 day with company' : 'Joined today';
  }

  return `${parts.join(' ')} with company`;
}
