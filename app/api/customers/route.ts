import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { serializeCustomerWithContacts, syncCustomerContacts } from '@/lib/partyContacts';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import {
  partyListPartyFieldsSchema,
  primaryFromPartyContacts,
  prismaPartyFieldsFromBody,
} from '@/lib/partyListRecordPayload';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

/** Body matches party lists API field names for license/TRN/contacts; see API-party-lists.md */
const CustomerSchema = z
  .object({
    name: z.string().min(1).max(100),
    contactPerson: z.string().max(100).optional(),
    phone: z.string().max(30).optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    address: z.string().max(500).optional(),
  })
  .merge(partyListPartyFieldsSchema);

async function buildCustomerListWhere(
  companyId: string,
  opts: {
    status: string | null;
    search: string;
  },
): Promise<Prisma.CustomerWhereInput> {
  const where: Prisma.CustomerWhereInput = { companyId };

  if (opts.status === 'active') where.isActive = true;
  if (opts.status === 'inactive') where.isActive = false;

  if (!opts.search) return where;

  const searchOr: Prisma.CustomerWhereInput[] = [
    { name: { contains: opts.search, mode: 'insensitive' } },
    { contactPerson: { contains: opts.search, mode: 'insensitive' } },
    { phone: { contains: opts.search, mode: 'insensitive' } },
    { email: { contains: opts.search, mode: 'insensitive' } },
    { address: { contains: opts.search, mode: 'insensitive' } },
  ];

  const jobsWithMatch = await prisma.job.findMany({
    where: {
      companyId,
      OR: [
        { jobNumber: { contains: opts.search, mode: 'insensitive' } },
        { description: { contains: opts.search, mode: 'insensitive' } },
        { site: { contains: opts.search, mode: 'insensitive' } },
        { projectName: { contains: opts.search, mode: 'insensitive' } },
      ],
    },
    select: { customerId: true },
    distinct: ['customerId'],
  });

  const customerIdsFromJobs = jobsWithMatch.map((job) => job.customerId);
  if (customerIdsFromJobs.length > 0) {
    searchOr.push({ id: { in: customerIdsFromJobs } });
  }

  return { ...where, OR: searchOr };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');

  try {
    if (limitParam !== null) {
      const limit = parseListLimit(limitParam);
      const offset = parseListOffset(searchParams.get('offset'));
      const search = searchParams.get('search')?.trim() ?? '';
      const status = searchParams.get('status');

      const where = await buildCustomerListWhere(companyId, { status, search });

      const [total, customers] = await Promise.all([
        prisma.customer.count({ where }),
        prisma.customer.findMany({
          where,
          orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
          skip: offset,
          take: limit,
          include: {
            contacts: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        }),
      ]);

      return successResponse({
        items: customers.map(serializeCustomerWithContacts),
        total,
      });
    }

    const customers = await prisma.customer.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      include: {
        contacts: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    return successResponse(customers.map(serializeCustomerWithContacts));
  } catch {
    return errorResponse('Failed to fetch customers', 500);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.create')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { customerSourceMode: true },
  });
  if (company?.customerSourceMode === 'EXTERNAL_ONLY') {
    return errorResponse(
      'Manual customer creation is disabled. This company is set to external-only customers (use the integration API or party lists sync).',
      403
    );
  }

  const body = await req.json();
  const parsed = CustomerSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const p = parsed.data;
    const party = prismaPartyFieldsFromBody(p);
    const fromContacts = primaryFromPartyContacts(p.contacts);
    const contactPersonFallback = p.contactPerson?.trim() || null;
    const phoneFallback = p.phone?.trim() || null;
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          companyId,
          name: p.name,
          email: p.email?.trim() ? p.email.trim() : null,
          address: p.address?.trim() || null,
          contactPerson: fromContacts.contactPerson ?? contactPersonFallback,
          phone: fromContacts.phone ?? phoneFallback,
          tradeLicenseNumber: party.tradeLicenseNumber,
          tradeLicenseAuthority: party.tradeLicenseAuthority,
          tradeLicenseExpiry: party.tradeLicenseExpiry,
          trnNumber: party.trnNumber,
          trnExpiry: party.trnExpiry,
          isActive: true,
          source: 'LOCAL',
          externalPartyId: null,
        },
      });
      await syncCustomerContacts(tx, {
        companyId,
        customerId: created.id,
        contacts: party.contacts,
      });
      return tx.customer.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          contacts: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
    publishLiveUpdate({
      companyId,
      channel: 'customers',
      entity: 'customer',
      action: 'created',
    });
    return successResponse(serializeCustomerWithContacts(customer), 201);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to create customer';
    if (errorMsg.includes('Unique constraint failed')) {
      return errorResponse('Customer name already exists for this company', 409);
    }
    return errorResponse(errorMsg, 500);
  }
}
