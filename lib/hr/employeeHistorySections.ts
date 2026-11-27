export const HISTORY_SECTIONS = [
  'personal',
  'absent',
  'leave',
  'salary',
  'deductions',
  'pay',
  'advances',
  'fines',
  'visa',
  'documents',
  'warnings',
] as const;

export type HistorySection = (typeof HISTORY_SECTIONS)[number];

export const DEFAULT_HISTORY_SECTIONS: HistorySection[] = [
  'absent',
  'leave',
  'salary',
  'deductions',
  'pay',
  'advances',
  'fines',
  'visa',
  'warnings',
];

const SECTION_SET = new Set<string>(HISTORY_SECTIONS);

export type HistorySectionSelection = HistorySection[] | 'all';

/** Missing parameter means every permitted section. `none` and an empty value mean basic info only. */
export function parseHistorySections(value: string | null): HistorySectionSelection {
  if (value == null) return 'all';
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'none') return [];
  const picked: HistorySection[] = [];
  for (const part of trimmed.split(',')) {
    const raw = part.trim();
    const id = raw === 'attendance' ? 'absent' : raw;
    if (SECTION_SET.has(id) && !picked.includes(id as HistorySection)) picked.push(id as HistorySection);
  }
  return picked;
}

export function historySectionsQuery(sections: HistorySection[]): string {
  return sections.length ? sections.join(',') : 'none';
}

export function sectionSelected(selection: HistorySectionSelection, section: HistorySection): boolean {
  return selection === 'all' || selection.includes(section);
}

export function allowedHistorySections(access: {
  attendanceAndLeave: boolean;
  payroll: boolean;
  compensation: boolean;
  visa: boolean;
  documents: boolean;
}): HistorySection[] {
  return HISTORY_SECTIONS.filter((section) => {
    if (section === 'absent' || section === 'leave') return access.attendanceAndLeave;
    if (section === 'pay' || section === 'advances' || section === 'fines') return access.payroll;
    if (section === 'salary') return access.compensation;
    if (section === 'deductions') return access.compensation || access.payroll;
    if (section === 'visa') return access.visa;
    if (section === 'documents') return access.documents;
    return true;
  });
}

export function documentOverlapsHistoryRange(input: {
  issueDate: string | null;
  expiryDate: string | null;
  from: string;
  to: string;
  fullHistory: boolean;
}): boolean {
  if (!input.issueDate && !input.expiryDate) return input.fullHistory;
  if (input.issueDate && input.issueDate > input.to) return false;
  if (input.expiryDate && input.expiryDate < input.from) return false;
  return true;
}
