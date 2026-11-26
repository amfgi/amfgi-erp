export const EMPLOYEE_CODE_COUNTING_STYLES = ['SEQUENTIAL', 'YEARLY', 'MONTHLY'] as const;

export type EmployeeCodeCountingStyle = (typeof EMPLOYEE_CODE_COUNTING_STYLES)[number];

export type EmployeeCodeSettings = {
  /** Leading text, e.g. EMP or AMF */
  prefix: string;
  /** Leading text used only when Employment Type is Temporary. Blank keeps the company prefix. */
  temporaryPrefix: string;
  /** Between prefix / period / number. Use "" for none. */
  separator: string;
  /** Zero-pad width for the numeric counter (1–12). */
  padLength: number;
  countingStyle: EmployeeCodeCountingStyle;
  /** First number when no matching codes exist yet. */
  startFrom: number;
};

export const DEFAULT_EMPLOYEE_CODE_SETTINGS: EmployeeCodeSettings = {
  prefix: 'EMP',
  temporaryPrefix: '',
  separator: '-',
  padLength: 4,
  countingStyle: 'SEQUENTIAL',
  startFrom: 1,
};

export const EMPLOYEE_CODE_COUNTING_STYLE_OPTIONS: Array<{
  value: EmployeeCodeCountingStyle;
  label: string;
  description: string;
}> = [
  {
    value: 'SEQUENTIAL',
    label: 'Sequential',
    description: 'Continuous counter across all time (e.g. EMP-0001, EMP-0002).',
  },
  {
    value: 'YEARLY',
    label: 'Yearly',
    description: 'Resets each calendar year (e.g. EMP-2026-0001).',
  },
  {
    value: 'MONTHLY',
    label: 'Monthly',
    description: 'Resets each calendar month (e.g. EMP-202609-0001).',
  },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePrefix(input: unknown, fallback: string): string {
  const raw = String(input ?? '')
    .trim()
    // Keep letters, digits, and common ID punctuation; drop whitespace/control chars
    .replace(/[^\p{L}\p{N}#@&+\-=()[\]{}.,_/\\:;!?$%*~]/gu, '');
  if (!raw) return fallback;
  return raw.slice(0, 40);
}

function normalizeSeparator(input: unknown, fallback: string): string {
  const raw = String(input ?? '');
  // Allow empty, hyphen, underscore, slash, or period only
  if (raw === '') return '';
  if (/^[-_/.]$/.test(raw)) return raw;
  return fallback;
}

function normalizePadLength(input: unknown, fallback: number): number {
  const num = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(12, Math.max(1, Math.round(num)));
}

function normalizeStartFrom(input: unknown, fallback: number): number {
  const num = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(num) || num < 1) return fallback;
  return Math.min(1_000_000_000, Math.round(num));
}

function normalizeCountingStyle(input: unknown, fallback: EmployeeCodeCountingStyle): EmployeeCodeCountingStyle {
  const raw = String(input ?? '').trim().toUpperCase();
  if ((EMPLOYEE_CODE_COUNTING_STYLES as readonly string[]).includes(raw)) {
    return raw as EmployeeCodeCountingStyle;
  }
  return fallback;
}

export function normalizeEmployeeCodeSettings(raw: unknown): EmployeeCodeSettings {
  const fallback = DEFAULT_EMPLOYEE_CODE_SETTINGS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...fallback };
  }
  const rec = raw as Record<string, unknown>;
  return {
    prefix: normalizePrefix(rec.prefix, fallback.prefix),
    temporaryPrefix: normalizePrefix(rec.temporaryPrefix, ''),
    separator: normalizeSeparator(rec.separator, fallback.separator),
    padLength: normalizePadLength(rec.padLength, fallback.padLength),
    countingStyle: normalizeCountingStyle(rec.countingStyle, fallback.countingStyle),
    startFrom: normalizeStartFrom(rec.startFrom, fallback.startFrom),
  };
}

export function isTemporaryEmploymentType(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'temporary';
}

/** True when the two prefixes would be read as one series. A blank temporary prefix does not clash. */
export function employeeCodePrefixesClash(prefix: string, temporaryPrefix: string): boolean {
  const company = prefix.trim().toLowerCase();
  const temporary = temporaryPrefix.trim().toLowerCase();
  if (!company || !temporary) return false;
  return company === temporary || company.startsWith(temporary) || temporary.startsWith(company);
}

/** Company settings, with the prefix swapped only for a Temporary employee who has a saved temporary prefix. */
export function codeSettingsForEmploymentType(
  settings: EmployeeCodeSettings,
  employmentType: string | null | undefined,
): EmployeeCodeSettings {
  const normalized = normalizeEmployeeCodeSettings(settings);
  if (!isTemporaryEmploymentType(employmentType) || !normalized.temporaryPrefix) return normalized;
  return { ...normalized, prefix: normalized.temporaryPrefix };
}

export function readEmployeeCodeSettingsFromCompanyData(input: {
  hrEmployeeCodeSettings?: unknown;
} | null | undefined): EmployeeCodeSettings {
  return normalizeEmployeeCodeSettings(input?.hrEmployeeCodeSettings);
}

export function periodKeyForStyle(
  style: EmployeeCodeCountingStyle,
  referenceDate = new Date()
): string | null {
  const y = referenceDate.getFullYear();
  const m = String(referenceDate.getMonth() + 1).padStart(2, '0');
  if (style === 'YEARLY') return String(y);
  if (style === 'MONTHLY') return `${y}${m}`;
  return null;
}

export function formatEmployeeCode(
  settings: EmployeeCodeSettings,
  sequence: number,
  referenceDate = new Date()
): string {
  const normalized = normalizeEmployeeCodeSettings(settings);
  const padded = String(Math.max(0, Math.round(sequence))).padStart(normalized.padLength, '0');
  const parts = [normalized.prefix];
  const period = periodKeyForStyle(normalized.countingStyle, referenceDate);
  if (period) parts.push(period);
  parts.push(padded);
  return parts.join(normalized.separator);
}

/** Regex that captures the numeric sequence for the active period. */
export function employeeCodeSequenceRegex(
  settings: EmployeeCodeSettings,
  referenceDate = new Date()
): RegExp {
  const normalized = normalizeEmployeeCodeSettings(settings);
  const prefix = escapeRegExp(normalized.prefix);
  const sep = escapeRegExp(normalized.separator);
  const period = periodKeyForStyle(normalized.countingStyle, referenceDate);
  if (period) {
    return new RegExp(`^${prefix}${sep}${escapeRegExp(period)}${sep}(\\d+)$`, 'i');
  }
  return new RegExp(`^${prefix}${sep}(\\d+)$`, 'i');
}

export function extractMaxSequenceFromCodes(
  codes: string[],
  settings: EmployeeCodeSettings,
  referenceDate = new Date()
): number | null {
  const re = employeeCodeSequenceRegex(settings, referenceDate);
  let max: number | null = null;
  for (const code of codes) {
    const match = String(code ?? '').trim().match(re);
    if (!match) continue;
    const n = Number(match[1]);
    if (!Number.isFinite(n)) continue;
    max = max === null ? n : Math.max(max, n);
  }
  return max;
}

/** Company prefix, plus the temporary prefix when it is set and not the same text. */
export function employeeCodeSeriesPrefixes(settings: EmployeeCodeSettings): string[] {
  const normalized = normalizeEmployeeCodeSettings(settings);
  const prefixes = [normalized.prefix];
  const temporary = normalized.temporaryPrefix;
  if (temporary && temporary.toLowerCase() !== normalized.prefix.toLowerCase()) prefixes.push(temporary);
  return prefixes;
}

/** Highest number on either prefix for the same separator and period. Pass the original settings, not a prefix-swapped copy. */
export function extractSharedMaxSequence(
  codes: string[],
  settings: EmployeeCodeSettings,
  referenceDate = new Date(),
): number | null {
  const normalized = normalizeEmployeeCodeSettings(settings);
  let max: number | null = null;
  for (const prefix of employeeCodeSeriesPrefixes(normalized)) {
    const seriesMax = extractMaxSequenceFromCodes(codes, { ...normalized, prefix }, referenceDate);
    if (seriesMax === null) continue;
    max = max === null ? seriesMax : Math.max(max, seriesMax);
  }
  return max;
}

export function nextEmployeeCodeFromExisting(
  codes: string[],
  settings: EmployeeCodeSettings,
  referenceDate = new Date(),
  employmentType?: string | null,
): string {
  const normalized = normalizeEmployeeCodeSettings(settings);
  const max = extractSharedMaxSequence(codes, normalized, referenceDate);
  const next = max === null ? normalized.startFrom : max + 1;
  return formatEmployeeCode(codeSettingsForEmploymentType(normalized, employmentType), next, referenceDate);
}

/** Example preview for the settings UI (uses startFrom, not live DB). */
export function previewEmployeeCodeExample(
  settings: EmployeeCodeSettings,
  referenceDate = new Date()
): string {
  return formatEmployeeCode(settings, normalizeEmployeeCodeSettings(settings).startFrom, referenceDate);
}

export type EmployeeCodeRenumberSource = {
  id: string;
  employeeCode: string;
  fullName: string;
  employmentType?: string | null;
  hireDate: Date | null;
  createdAt: Date;
};

export type EmployeeCodeRenumberRow = {
  id: string;
  fullName: string;
  employmentType: string | null;
  oldCode: string;
  newCode: string;
};

/** Hire date when it exists, otherwise the record's created date. */
function arrivalTime(employee: EmployeeCodeRenumberSource): number {
  const hire = employee.hireDate?.getTime();
  if (hire !== undefined && Number.isFinite(hire)) return hire;
  return employee.createdAt.getTime();
}

function compareArrival(a: EmployeeCodeRenumberSource, b: EmployeeCodeRenumberSource): number {
  const arrived = arrivalTime(a) - arrivalTime(b);
  if (arrived !== 0) return arrived;
  const created = a.createdAt.getTime() - b.createdAt.getTime();
  if (created !== 0) return created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Whoever arrived earlier gets the smaller number. One date or both is enough. Prefix follows employment type; the number is one series. */
export function planEmployeeCodeRenumber(
  employees: EmployeeCodeRenumberSource[],
  settings: EmployeeCodeSettings,
  referenceDate = new Date()
): EmployeeCodeRenumberRow[] {
  const normalized = normalizeEmployeeCodeSettings(settings);
  return [...employees].sort(compareArrival).map((employee, index) => ({
    id: employee.id,
    fullName: employee.fullName,
    employmentType: employee.employmentType?.trim() || null,
    oldCode: employee.employeeCode,
    newCode: formatEmployeeCode(
      codeSettingsForEmploymentType(normalized, employee.employmentType),
      normalized.startFrom + index,
      referenceDate,
    ),
  }));
}

export function employeeCodeRenumberClash(rows: EmployeeCodeRenumberRow[]): string | null {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.newCode.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return 'Two employees would receive the same ID. Change the prefixes so the series stay separate.';
    }
    seen.add(key);
  }
  return null;
}

export function temporaryEmployeeCode(employeeId: string): string {
  return `__tmp__${employeeId}`;
}

type ParsedEmployeeCode = {
  prefix: string;
  separator: string;
  period: string | null;
  sequence: number;
};

const CODE_SEPARATORS = ['-', '_', '/', '.', ''] as const;

function periodShape(style: EmployeeCodeCountingStyle): string | null {
  if (style === 'YEARLY') return '\\d{4}';
  if (style === 'MONTHLY') return '\\d{6}';
  return null;
}

function separatorsToTry(settings: EmployeeCodeSettings): string[] {
  const current = normalizeEmployeeCodeSettings(settings).separator;
  return [current, ...CODE_SEPARATORS.filter((separator) => separator !== current)];
}

/** Reads a code with this company's prefix. The separator already in the code is kept, even if settings now use another one. */
export function parseEmployeeCode(code: string, settings: EmployeeCodeSettings): ParsedEmployeeCode | null {
  const normalized = normalizeEmployeeCodeSettings(settings);
  const period = periodShape(normalized.countingStyle);
  const raw = String(code ?? '').trim();
  for (const separator of separatorsToTry(normalized)) {
    const sep = escapeRegExp(separator);
    for (const prefix of employeeCodeSeriesPrefixes(normalized)) {
      const prefixRe = escapeRegExp(prefix);
      const re = period
        ? new RegExp(`^${prefixRe}${sep}(${period})${sep}(\\d+)$`, 'i')
        : new RegExp(`^${prefixRe}${sep}(\\d+)$`, 'i');
      const match = raw.match(re);
      if (!match) continue;
      const sequence = Number(period ? match[2] : match[1]);
      if (!Number.isFinite(sequence)) continue;
      return { prefix, separator, period: period ? match[1]! : null, sequence };
    }
  }
  return null;
}

function formatEmployeeCodeWithPeriod(
  settings: EmployeeCodeSettings,
  sequence: number,
  period: string | null,
  separator: string,
): string {
  const normalized = normalizeEmployeeCodeSettings(settings);
  const padded = String(Math.max(0, Math.round(sequence))).padStart(normalized.padLength, '0');
  const parts = [normalized.prefix];
  if (period) parts.push(period);
  parts.push(padded);
  return parts.join(separator);
}

/**
 * Visible code after an employment-type change. The hidden employee id is not involved.
 * Keeps the number when the new prefix is free. Otherwise steps ahead, then back, inside the same period.
 * The person's own code must not be included in otherCodes.
 */
export function employeeCodeForEmploymentType(
  currentCode: string,
  employmentType: string | null | undefined,
  settings: EmployeeCodeSettings,
  otherCodes: string[],
): string {
  const normalized = normalizeEmployeeCodeSettings(settings);
  const current = String(currentCode ?? '').trim();
  const parsed = parseEmployeeCode(current, normalized);
  if (!parsed) return current;

  const target = codeSettingsForEmploymentType(normalized, employmentType);
  if (target.prefix.toLowerCase() === parsed.prefix.toLowerCase()) return current;

  const periodKey = parsed.period ?? '';
  const used = new Set<number>();
  for (const code of otherCodes) {
    const row = parseEmployeeCode(code, normalized);
    if (!row || row.separator !== parsed.separator || (row.period ?? '') !== periodKey) continue;
    used.add(row.sequence);
  }

  const preferred = formatEmployeeCodeWithPeriod(target, parsed.sequence, parsed.period, parsed.separator);
  const preferredTaken = otherCodes.some((code) => code.trim().toLowerCase() === preferred.toLowerCase());
  if (!preferredTaken) return preferred;

  const highest = Math.max(parsed.sequence, ...used, 0);
  const limit = highest + used.size + 1;
  for (let step = 1; step <= limit; step++) {
    const ahead = parsed.sequence + step;
    if (!used.has(ahead)) return formatEmployeeCodeWithPeriod(target, ahead, parsed.period, parsed.separator);
    const behind = parsed.sequence - step;
    if (behind >= 1 && !used.has(behind)) {
      return formatEmployeeCodeWithPeriod(target, behind, parsed.period, parsed.separator);
    }
  }
  return preferred;
}
