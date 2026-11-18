import { prisma } from '@/lib/db/prisma';
import { resolveAuthUrl } from '@/lib/auth/authEnv';
import { dubaiTodayYmd } from '@/lib/hr/leaveReturn';
import {
  isHrOnlyRecipient,
  selectDueVisaNotices,
  visaDocumentNumber,
  type DueVisaNotice,
  type SentVisaNotice,
  type VisaForNotice,
  type VisaNoticeStage,
} from '@/lib/hr/visaExpiryNotice';
import { HR_ROLE_SLUG } from '@/lib/permissions';
import { sendMail } from '@/lib/mail/sendMail';

const KIND: Record<VisaNoticeStage, string> = {
  '60': 'VISA_EXPIRY_60',
  '30': 'VISA_EXPIRY_30',
};

type HrRecipient = { id: string; name: string; email: string; companyIds: string[] };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clip(value: string | null | undefined, max = 500): string | null {
  const text = value?.trim();
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function profileUrl(employeeId: string): string | null {
  const base = resolveAuthUrl();
  return base ? `${base}/hr/employees/${employeeId}` : null;
}

function digestSubject(count: number): string {
  return count === 1 ? '1 visa expiring' : `${count} visas expiring`;
}

function digestHtml(rows: DueVisaNotice[]): string {
  const body = rows
    .map((row) => {
      const url = profileUrl(row.visa.employeeId);
      const name = escapeHtml(row.visa.employeeName);
      const linkedName = url ? `<a href="${escapeHtml(url)}">${name}</a>` : name;
      return `<tr>
        <td>${linkedName}</td>
        <td>${escapeHtml(row.visa.employeeCode)}</td>
        <td>${escapeHtml(row.visa.visaNumber || 'not recorded')}</td>
        <td>${escapeHtml(row.visa.label)}</td>
        <td>${escapeHtml(row.visa.endDate)}</td>
      </tr>`;
    })
    .join('');
  return `<p>These employee visas are approaching their expiry date.</p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">
  <thead><tr><th>Name</th><th>Employee ID</th><th>Visa number</th><th>Visa</th><th>Expiry</th></tr></thead>
  <tbody>${body}</tbody>
</table>`;
}

function digestText(rows: DueVisaNotice[]): string {
  return rows
    .map((row) => {
      const url = profileUrl(row.visa.employeeId);
      return [
        `${row.visa.employeeName} (${row.visa.employeeCode})`,
        `Visa number: ${row.visa.visaNumber || 'not recorded'}`,
        `${row.visa.label}, expires ${row.visa.endDate}`,
        url ?? '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

async function loadVisas(): Promise<VisaForNotice[]> {
  const rows = await prisma.visaPeriod.findMany({
    where: { status: 'ACTIVE', employee: { status: { not: 'EXITED' } } },
    select: {
      id: true,
      companyId: true,
      label: true,
      endDate: true,
      employee: { select: { id: true, fullName: true, employeeCode: true, status: true } },
      documents: {
        select: {
          documentNumber: true,
          documentType: { select: { requiresVisaPeriod: true, sortOrder: true } },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    employeeId: row.employee.id,
    employeeName: row.employee.fullName,
    employeeCode: row.employee.employeeCode,
    label: row.label,
    endDate: row.endDate.toISOString().slice(0, 10),
    employeeStatus: row.employee.status,
    visaNumber: visaDocumentNumber(
      row.documents.map((document) => ({
        documentNumber: document.documentNumber,
        requiresVisaPeriod: document.documentType.requiresVisaPeriod,
        sortOrder: document.documentType.sortOrder,
      })),
    ),
  }));
}

async function loadHrRecipients(): Promise<HrRecipient[]> {
  const hrRows = await prisma.userCompanyAccess.findMany({
    where: { role: { slug: HR_ROLE_SLUG }, user: { isActive: true, isSuperAdmin: false } },
    select: {
      userId: true,
      companyId: true,
      user: { select: { id: true, name: true, email: true, isActive: true, isSuperAdmin: true } },
    },
  });
  const userIds = [...new Set(hrRows.map((row) => row.userId))];
  if (userIds.length === 0) return [];
  const roleRows = await prisma.userCompanyAccess.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, role: { select: { slug: true } } },
  });
  const slugsByUser = new Map<string, string[]>();
  for (const row of roleRows) {
    const slugs = slugsByUser.get(row.userId) ?? [];
    slugs.push(row.role.slug);
    slugsByUser.set(row.userId, slugs);
  }
  const byUser = new Map<string, HrRecipient>();
  for (const row of hrRows) {
    const user = row.user;
    if (!isHrOnlyRecipient({
      isSuperAdmin: user.isSuperAdmin,
      isActive: user.isActive,
      email: user.email,
      roleSlugs: slugsByUser.get(row.userId) ?? [],
    })) {
      continue;
    }
    const existing = byUser.get(user.id) ?? { id: user.id, name: user.name, email: user.email.trim(), companyIds: [] };
    existing.companyIds.push(row.companyId);
    byUser.set(user.id, existing);
  }
  return [...byUser.values()];
}

async function loadSent(visaIds: string[]): Promise<SentVisaNotice[]> {
  if (visaIds.length === 0) return [];
  const rows = await prisma.outboundEmail.findMany({
    where: {
      status: 'SENT',
      relatedId: { in: visaIds },
      kind: { in: [KIND['60'], KIND['30']] },
      toUserId: { not: null },
    },
    select: { kind: true, relatedId: true, toUserId: true, createdAt: true },
  });
  return rows.flatMap((row) => {
    if (!row.relatedId || !row.toUserId) return [];
    const stage: VisaNoticeStage | null = row.kind === KIND['60'] ? '60' : row.kind === KIND['30'] ? '30' : null;
    if (!stage) return [];
    return [{
      visaId: row.relatedId,
      recipientId: row.toUserId,
      stage,
      sentOn: dubaiTodayYmd(row.createdAt),
    }];
  });
}

async function recordAttempt(input: {
  companyId: string;
  visaId: string;
  stage: VisaNoticeStage;
  toEmail: string;
  toUserId: string;
  subject: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  error?: string | null;
  provider?: string | null;
}) {
  await prisma.outboundEmail.create({
    data: {
      companyId: input.companyId,
      kind: KIND[input.stage],
      toEmail: input.toEmail,
      toUserId: input.toUserId,
      subject: clip(input.subject, 200) ?? input.subject,
      status: input.status,
      error: clip(input.error, 300),
      provider: input.provider ?? null,
      relatedId: input.visaId,
    },
  });
}

export async function runVisaExpiryNotices(now = new Date()): Promise<{
  digests: number;
  visas: number;
  sent: number;
  failed: number;
}> {
  if (process.env.NODE_ENV !== 'production') {
    return { digests: 0, visas: 0, sent: 0, failed: 0 };
  }

  const today = dubaiTodayYmd(now);
  const [visas, recipients] = await Promise.all([loadVisas(), loadHrRecipients()]);
  const sent = await loadSent(visas.map((visa) => visa.id));
  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));
  const groups = new Map<string, DueVisaNotice[]>();

  for (const recipient of recipients) {
    for (const companyId of recipient.companyIds) {
      const due = selectDueVisaNotices({
        today,
        visas: visas.filter((visa) => visa.companyId === companyId),
        sent,
        recipientIds: [recipient.id],
      });
      if (due.length > 0) groups.set(`${companyId}:${recipient.id}`, due);
    }
  }

  let digests = 0;
  let visaCount = 0;
  let sentCount = 0;
  let failedCount = 0;

  for (const rows of groups.values()) {
    const recipient = recipientById.get(rows[0]?.recipientId ?? '');
    if (!recipient || rows.length === 0) continue;
    const subject = digestSubject(rows.length);
    const result = await sendMail(prisma, {
      to: recipient.email,
      subject,
      html: digestHtml(rows),
      text: digestText(rows),
    }).catch((err: unknown) => ({
      sent: false as const,
      devLogged: false as const,
      provider: null,
      error: err instanceof Error ? err.message : 'Mail send failed',
    }));
    const status = result.sent ? 'SENT' : result.devLogged ? 'SKIPPED' : 'FAILED';
    for (const row of rows) {
      await recordAttempt({
        companyId: row.visa.companyId,
        visaId: row.visa.id,
        stage: row.stage,
        toEmail: recipient.email,
        toUserId: recipient.id,
        subject,
        status,
        error: result.error,
        provider: result.provider,
      });
    }
    digests += 1;
    visaCount += rows.length;
    if (status === 'SENT') sentCount += rows.length;
    if (status === 'FAILED') failedCount += rows.length;
  }

  return { digests, visas: visaCount, sent: sentCount, failed: failedCount };
}
