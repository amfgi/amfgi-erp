import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { resolveAuthUrl } from '@/lib/auth/authEnv';
import { sendMail } from '@/lib/mail/sendMail';
import { P } from '@/lib/permissions';

const NOT_CONFIGURED = 'Mail provider is not configured';

type NoticeUser = { id: string; name: string; email: string };

type NoticeKind = 'QUERY_CREATED' | 'QUOTATION_ASSIGNED';

export type QueryCreatedNotice = {
  companyId: string;
  salesQueryId: string;
  queryNumber: string;
  customerName: string;
  projectLocation: string;
  actorId: string;
};

export type QuotationAssignedNotice = QueryCreatedNotice & {
  quotationNumber: string;
  assignee: NoticeUser;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function appBaseUrl(): string {
  return resolveAuthUrl() || 'http://localhost:3000';
}

function recordUrl(pathname: string): string {
  return new URL(pathname, `${appBaseUrl()}/`).toString();
}

function dedupeUsers(rows: NoticeUser[]): NoticeUser[] {
  const seen = new Set<string>();
  const unique: NoticeUser[] = [];
  for (const row of rows) {
    const emailKey = row.email.trim().toLowerCase();
    const key = emailKey || `user:${row.id}`;
    if (seen.has(key) || seen.has(`user:${row.id}`)) continue;
    seen.add(key);
    seen.add(`user:${row.id}`);
    unique.push(row);
  }
  return unique;
}

function listUsersWithPermission(companyId: string, permission: string) {
  return prisma.$queryRaw<NoticeUser[]>(Prisma.sql`
    SELECT DISTINCT u.id, u.name, u.email
    FROM "User" u
    JOIN "UserCompanyAccess" a ON a."userId" = u.id AND a."companyId" = ${companyId}
    JOIN "Role" r ON r.id = a."roleId"
    WHERE u."isActive" = true
      AND (
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(r.permissions) = 'array' THEN r.permissions ELSE '[]'::jsonb END
          ) AS perm(value)
          WHERE perm.value = ${permission}
        )
        OR EXISTS (
          SELECT 1
          FROM "UserCompanyExtraPermission" x
          WHERE x."userId" = u.id
            AND x."companyId" = ${companyId}
            AND u."isSuperAdmin" = false
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(x.permissions) = 'array' THEN x.permissions ELSE '[]'::jsonb END
              ) AS extra(value)
              WHERE extra.value = ${permission}
            )
        )
      )
    ORDER BY u.name ASC
  `);
}

async function actorName(actorId: string): Promise<string> {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true },
  });
  return actor?.name?.trim() || 'A user';
}

async function recordAttempt(input: {
  companyId: string;
  kind: NoticeKind;
  toEmail: string;
  toUserId: string;
  subject: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  error: string | null;
  provider: string | null;
  relatedId: string;
}) {
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OutboundEmail" (
        "id",
        "companyId",
        "kind",
        "toEmail",
        "toUserId",
        "subject",
        "status",
        "error",
        "provider",
        "relatedId",
        "createdAt"
      ) VALUES (
        ${randomUUID()},
        ${input.companyId},
        ${input.kind},
        ${clip(input.toEmail, 320)},
        ${input.toUserId},
        ${clip(input.subject, 200) || input.kind},
        ${input.status},
        ${input.error ? clip(input.error, 300) : null},
        ${input.provider ? clip(input.provider, 40) : null},
        ${input.relatedId},
        NOW()
      )
    `);
  } catch (err) {
    console.error('[mail] could not record outbound email:', err);
  }
}

async function deliver(input: {
  companyId: string;
  kind: NoticeKind;
  recipient: NoticeUser;
  subject: string;
  html: string;
  text: string;
  relatedId: string;
}) {
  const toEmail = input.recipient.email.trim();
  if (!toEmail) {
    await recordAttempt({
      companyId: input.companyId,
      kind: input.kind,
      toEmail: '',
      toUserId: input.recipient.id,
      subject: input.subject,
      status: 'SKIPPED',
      error: 'User has no email address',
      provider: null,
      relatedId: input.relatedId,
    });
    return;
  }

  try {
    const result = await sendMail(prisma, {
      to: toEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    const notConfigured = !result.sent && (!result.error || result.error === NOT_CONFIGURED);
    await recordAttempt({
      companyId: input.companyId,
      kind: input.kind,
      toEmail,
      toUserId: input.recipient.id,
      subject: input.subject,
      status: result.sent ? 'SENT' : notConfigured ? 'SKIPPED' : 'FAILED',
      error: result.sent ? null : result.error || NOT_CONFIGURED,
      provider: result.provider,
      relatedId: input.relatedId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await recordAttempt({
      companyId: input.companyId,
      kind: input.kind,
      toEmail,
      toUserId: input.recipient.id,
      subject: input.subject,
      status: 'FAILED',
      error: message,
      provider: null,
      relatedId: input.relatedId,
    });
  }
}

export async function notifyQueryCreated(notice: QueryCreatedNotice): Promise<void> {
  const [recipients, createdBy] = await Promise.all([
    listUsersWithPermission(notice.companyId, P.SALES_QUERY_NOTICE),
    actorName(notice.actorId),
  ]);
  const link = recordUrl(`/sales/queries/form?id=${encodeURIComponent(notice.salesQueryId)}`);
  const subject = clip(`New query ${notice.queryNumber}`, 200);
  const text = [
    `${createdBy} created query ${notice.queryNumber}.`,
    `Customer: ${notice.customerName}`,
    `Location: ${notice.projectLocation}`,
    link,
  ].join('\n');
  const html = `
    <p>${escapeHtml(createdBy)} created query <strong>${escapeHtml(notice.queryNumber)}</strong>.</p>
    <p>Customer: ${escapeHtml(notice.customerName)}<br>Location: ${escapeHtml(notice.projectLocation)}</p>
    <p><a href="${escapeHtml(link)}">Open query</a></p>
  `.trim();

  await Promise.all(dedupeUsers(recipients).map((recipient) => deliver({
    companyId: notice.companyId,
    kind: 'QUERY_CREATED',
    recipient,
    subject,
    html,
    text,
    relatedId: notice.salesQueryId,
  })));
}

export async function notifyQuotationAssigned(notice: QuotationAssignedNotice): Promise<void> {
  const [noticeHolders, assignedBy] = await Promise.all([
    listUsersWithPermission(notice.companyId, P.SALES_QUOTATION_NOTICE),
    actorName(notice.actorId),
  ]);
  const recipients = dedupeUsers([notice.assignee, ...noticeHolders]);
  const link = recordUrl(`/sales/quotations/form?id=${encodeURIComponent(notice.salesQueryId)}`);

  await Promise.all(recipients.map(async (recipient) => {
    const assignedToYou = recipient.id === notice.assignee.id;
    const assigneeLabel = assignedToYou ? 'you' : notice.assignee.name;
    const subject = clip(
      assignedToYou
        ? `Quotation ${notice.quotationNumber} assigned to you`
        : `Quotation ${notice.quotationNumber} assigned to ${notice.assignee.name}`,
      200,
    );
    const text = [
      `${assignedBy} assigned quotation ${notice.quotationNumber} to ${assigneeLabel}.`,
      `Query: ${notice.queryNumber}`,
      `Customer: ${notice.customerName}`,
      `Location: ${notice.projectLocation}`,
      link,
    ].join('\n');
    const html = `
      <p>${escapeHtml(assignedBy)} assigned quotation <strong>${escapeHtml(notice.quotationNumber)}</strong> to ${escapeHtml(assigneeLabel)}.</p>
      <p>Query: ${escapeHtml(notice.queryNumber)}<br>Customer: ${escapeHtml(notice.customerName)}<br>Location: ${escapeHtml(notice.projectLocation)}</p>
      <p><a href="${escapeHtml(link)}">Open quotation</a></p>
    `.trim();
    await deliver({
      companyId: notice.companyId,
      kind: 'QUOTATION_ASSIGNED',
      recipient,
      subject,
      html,
      text,
      relatedId: notice.salesQueryId,
    });
  }));
}
