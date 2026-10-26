import type { Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';

type Writer = Prisma.TransactionClient | PrismaClient;

const EDIT_WINDOW_MS = 15 * 60 * 1000;

const LABELS: Record<string, string> = {
  CREATED: 'Created the query',
  SAVED_QUERY: 'Saved the query',
  FORWARDED: 'Forwarded to quotation',
  EDITED_QUOTATION: 'Edited the quotation',
  REVISED: 'Issued a revision',
  PO_RECEIVED: 'Received the purchase order',
  SAVED_PO: 'Saved the purchase order',
  JOB_CREATED: 'Created the job',
  STATUS: 'Updated the status',
  FILE_UPLOADED: 'Uploaded a file',
};

export function salesWorkLabel(action: string) {
  return LABELS[action] ?? action;
}

export function closureWorkDetail(closure: string) {
  if (closure === 'OPEN') return 'Reopened';
  if (closure === 'LOST') return 'Marked lost';
  if (closure === 'CANCELLED') return 'Marked cancelled';
  if (closure === 'REJECTED') return 'Rejected the query';
  return closure;
}

function clip(value?: string | null) {
  const text = value?.trim();
  return text ? text.slice(0, 300) : null;
}

export async function writeSalesWorkLog(
  db: Writer,
  params: {
    companyId: string;
    salesQueryId: string;
    actorId: string;
    action: string;
    detail?: string | null;
  },
) {
  const detail = clip(params.detail);
  if (params.action === 'EDITED_QUOTATION') {
    const recent = await db.salesWorkLog.findFirst({
      where: {
        companyId: params.companyId,
        salesQueryId: params.salesQueryId,
        actorId: params.actorId,
        action: 'EDITED_QUOTATION',
        createdAt: { gte: new Date(Date.now() - EDIT_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (recent) {
      await db.salesWorkLog.update({
        where: { id: recent.id },
        data: { createdAt: new Date(), detail },
      });
      return;
    }
  }

  await db.salesWorkLog.create({
    data: {
      companyId: params.companyId,
      salesQueryId: params.salesQueryId,
      actorId: params.actorId,
      action: params.action,
      detail,
    },
  });
}

export async function listSalesWorkLog(companyId: string, salesQueryId: string) {
  const rows = await prisma.salesWorkLog.findMany({
    where: { companyId, salesQueryId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { actor: { select: { id: true, name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    label: salesWorkLabel(row.action),
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor,
  }));
}
