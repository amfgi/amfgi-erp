import { HR_ROLE_SLUG } from '@/lib/permissions';
import { addCalendarDays } from '@/lib/hr/leaveReturn';

export type VisaNoticeStage = '60' | '30';

export type VisaForNotice = {
  id: string;
  companyId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  label: string;
  endDate: string;
  visaNumber: string | null;
  employeeStatus?: string;
};

export type SentVisaNotice = {
  visaId: string;
  recipientId: string;
  stage: VisaNoticeStage;
  sentOn: string;
};

export type DueVisaNotice = {
  visa: VisaForNotice;
  stage: VisaNoticeStage;
  recipientId: string;
};

export function isHrOnlyRecipient(input: {
  isSuperAdmin: boolean;
  isActive: boolean;
  email: string;
  roleSlugs: string[];
}): boolean {
  if (input.isSuperAdmin || !input.isActive || !input.email.trim()) return false;
  const roles = [...new Set(input.roleSlugs)];
  return roles.length === 1 && roles[0] === HR_ROLE_SLUG;
}

export function visaDocumentNumber(
  documents: { documentNumber: string | null; requiresVisaPeriod: boolean; sortOrder: number }[],
): string | null {
  const numbered = documents
    .filter((document) => document.requiresVisaPeriod && document.documentNumber?.trim())
    .sort((left, right) => left.sortOrder - right.sortOrder);
  return numbered[0]?.documentNumber?.trim() || null;
}

function currentVisas(visas: VisaForNotice[]): VisaForNotice[] {
  const latestByEmployee = new Map<string, string>();
  for (const visa of visas) {
    const latest = latestByEmployee.get(visa.employeeId);
    if (!latest || visa.endDate > latest) latestByEmployee.set(visa.employeeId, visa.endDate);
  }
  return visas.filter(
    (visa) => visa.employeeStatus !== 'EXITED' && visa.endDate === latestByEmployee.get(visa.employeeId),
  );
}

function sentOn(sent: SentVisaNotice[], visaId: string, recipientId: string, stage: VisaNoticeStage): string | null {
  let earliest: string | null = null;
  for (const row of sent) {
    if (row.visaId !== visaId || row.recipientId !== recipientId || row.stage !== stage) continue;
    if (!earliest || row.sentOn < earliest) earliest = row.sentOn;
  }
  return earliest;
}

export function selectDueVisaNotices(input: {
  today: string;
  visas: VisaForNotice[];
  sent: SentVisaNotice[];
  recipientIds: string[];
}): DueVisaNotice[] {
  const limit60 = addCalendarDays(input.today, 60);
  const limit30 = addCalendarDays(input.today, 30);
  const due: DueVisaNotice[] = [];

  for (const visa of currentVisas(input.visas)) {
    if (visa.endDate < input.today || visa.endDate > limit60) continue;
    const inside30 = visa.endDate <= limit30;
    for (const recipientId of input.recipientIds) {
      const firstSentOn = sentOn(input.sent, visa.id, recipientId, '60');
      if (!firstSentOn) {
        due.push({ visa, stage: '60', recipientId });
        continue;
      }
      const followUpSent = sentOn(input.sent, visa.id, recipientId, '30');
      if (inside30 && firstSentOn < input.today && !followUpSent) {
        due.push({ visa, stage: '30', recipientId });
      }
    }
  }

  return due.sort((left, right) => {
    const byDate = left.visa.endDate.localeCompare(right.visa.endDate);
    if (byDate !== 0) return byDate;
    const byName = left.visa.employeeName.localeCompare(right.visa.employeeName);
    if (byName !== 0) return byName;
    return left.visa.id.localeCompare(right.visa.id);
  });
}
