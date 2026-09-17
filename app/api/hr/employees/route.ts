import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import type { Employee, Prisma } from '@prisma/client';
import { Prisma as PrismaNS } from '@prisma/client';
import { allocateNextEmployeeCode } from '@/lib/hr/allocateEmployeeCode';
import { provisionEmployeeUser } from '@/lib/hr/provisionEmployeeUser';
import {
  checkEmployeeEmailUserConflict,
  employeeEmailConflictStatus,
} from '@/lib/hr/employeeEmailUserConflict';
import {
  basicHoursForProfileExtension,
  employeeTypeFromProfileExtension,
  readEmployeeTypeSettingsFromCompanyData,
} from '@/lib/hr/employeeTypeSettings';
import {
  buildEmployeeListWhere,
  computeEmployeeDirectoryStats,
  countEmployeeDirectoryStats,
  filterEmployeesByWorkforceFilters,
  readEmployeeDirectoryFiltersFromSearchParams,
  sortEmployeesByName,
} from '@/lib/hr/employeeListQuery';
import { batchCurrentCompensationForEmployees } from '@/lib/import-export/employeeCompensationServer';
import { canHrCompensationView } from '@/lib/hr/compensationPermissions';
import { parseNationalityInput } from '@/lib/hr/countryNames';
import { P } from '@/lib/permissions';
import {
  companyIdWhere,
  requireHrSession,
  resolveHrWriteCompanyId,
} from '@/lib/hr/requireHrSession';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

/** Empty string or explicit null clears email; valid strings must be emails. */
const employeeEmailField = z
  .union([z.string().email(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : v));

const CreateSchema = z.object({
  companyId: z.string().min(1).optional(),
  /** When omitted/blank, server allocates the next code from company employee-code settings. */
  employeeCode: z.string().max(80).optional().nullable(),
  fullName: z.string().min(1).max(200),
  preferredName: z.string().max(200).optional().nullable(),
  email: employeeEmailField,
  phone: z.string().max(50).optional().nullable(),
  nationality: z.string().max(100).optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.string().max(20).optional().nullable(),
  designation: z.string().max(120).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  employmentType: z.string().max(80).optional().nullable(),
  signatureGroup: z.string().max(120).optional().nullable(),
  hireDate: z.string().optional().nullable(),
  terminationDate: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXITED']).optional(),
  emergencyContactName: z.string().max(200).optional().nullable(),
  emergencyContactPhone: z.string().max(50).optional().nullable(),
  bloodGroup: z.string().max(10).optional().nullable(),
  photoUrl: z.string().max(2000).optional().nullable(),
  portalEnabled: z.boolean().optional(),
  adminNotes: z.string().max(20000).optional().nullable(),
  profileExtension: z.unknown().optional().nullable(),
  /** When true (default) and `email` is set, creates or links a `User` for Google / portal login */
  autoProvisionLogin: z.boolean().optional(),
});

const companySelect = { id: true, name: true, slug: true } as const;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ctx = await requireHrSession({
    permission: P.HR_EMPLOYEE_VIEW,
    companyId: searchParams.get('companyId'),
  });
  if (!ctx.ok) return ctx.response;
  const { session, companyIds } = ctx;

  const idsParam = searchParams.get('ids');
  const forExport = searchParams.get('forExport') === '1';
  const directoryFilters = readEmployeeDirectoryFiltersFromSearchParams(searchParams);
  const { employeeType } = directoryFilters;
  const limitParam = searchParams.get('limit');
  const includeCompensation = canHrCompensationView(session.user);
  const listFilters = includeCompensation
    ? directoryFilters
    : { ...directoryFilters, compensation: undefined };
  const scope = companyIdWhere(companyIds);

  if (forExport) {
    const where = buildEmployeeListWhere(companyIds, listFilters);
    const exportIds = idsParam
      ? [...new Set(idsParam.split(',').map((part) => part.trim()).filter(Boolean))].slice(0, 10000)
      : [];
    if (exportIds.length > 0) {
      where.id = { in: exportIds };
    }
    const exportSelect = {
      id: true,
      companyId: true,
      employeeCode: true,
      fullName: true,
      preferredName: true,
      email: true,
      phone: true,
      nationality: true,
      dateOfBirth: true,
      gender: true,
      designation: true,
      department: true,
      employmentType: true,
      signatureGroup: true,
      hireDate: true,
      terminationDate: true,
      status: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      bloodGroup: true,
      portalEnabled: true,
      adminNotes: true,
      profileExtension: true,
      company: { select: companySelect },
    } as const;

    const list = await prisma.employee.findMany({
      where,
      orderBy: [{ fullName: 'asc' }],
      take: 10000,
      select: exportSelect,
    });
    const filtered = filterEmployeesByWorkforceFilters(list, directoryFilters);
    const sorted = sortEmployeesByName(filtered);
    const compensationByEmployee = await batchCurrentCompensationForEmployees(
      prisma,
      companyIds,
      sorted.map((e) => e.id)
    );
    return successResponse(
      sorted.map((employee) => ({
        ...employee,
        currentCompensation: compensationByEmployee.get(employee.id) ?? null,
      }))
    );
  }

  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, hrEmployeeTypeSettings: true, printTemplates: true },
  });
  const typeSettingsByCompany = new Map(
    companies.map((c) => [c.id, readEmployeeTypeSettingsFromCompanyData(c)])
  );

  const mapEmployee = (employee: Employee & { company?: { id: string; name: string; slug: string } }) => {
    const typeSettings = typeSettingsByCompany.get(employee.companyId) ?? readEmployeeTypeSettingsFromCompanyData(null);
    const employeeTypeValue = employeeTypeFromProfileExtension(employee.profileExtension);
    const timing = typeSettings[employeeTypeValue];
    return {
      ...employee,
      employeeType: employeeTypeValue,
      basicHoursPerDay: basicHoursForProfileExtension(employee.profileExtension, typeSettings),
      defaultTiming: timing
        ? {
            dutyStart: timing.dutyStart,
            dutyEnd: timing.dutyEnd,
            breakStart: timing.breakStart,
            breakEnd: timing.breakEnd,
          }
        : null,
    };
  };

  const attachCompensationToItems = async <T extends { id: string }>(items: T[]) => {
    if (!includeCompensation || items.length === 0) return items;
    const compensationByEmployee = await batchCurrentCompensationForEmployees(
      prisma,
      companyIds,
      items.map((employee) => employee.id)
    );
    return items.map((employee) => ({
      ...employee,
      currentCompensation: compensationByEmployee.get(employee.id) ?? null,
    }));
  };

  if (idsParam) {
    const ids = [...new Set(idsParam.split(',').map((part) => part.trim()).filter(Boolean))].slice(0, 100);
    if (ids.length === 0) return successResponse([]);
    const list = await prisma.employee.findMany({
      where: { ...scope, id: { in: ids } },
      orderBy: [{ fullName: 'asc' }],
      include: { company: { select: companySelect } },
    });
    return successResponse(list.map(mapEmployee));
  }

  const where = buildEmployeeListWhere(companyIds, listFilters);

  const applyEmployeeTypeFilter = <T extends { profileExtension: unknown }>(rows: T[]) => {
    if (!employeeType || employeeType === 'ALL') return rows;
    return rows.filter((employee) => {
      const type = employeeTypeFromProfileExtension(employee.profileExtension);
      if (employeeType === '__none__') return !type || type.trim() === '';
      return type === employeeType;
    });
  };

  if (limitParam !== null) {
    const limit = parseListLimit(limitParam);
    const offset = parseListOffset(searchParams.get('offset'));

    const needsTypeFilter = Boolean(employeeType && employeeType !== 'ALL');

    if (needsTypeFilter) {
      const allRows = await prisma.employee.findMany({
        where,
        orderBy: [{ fullName: 'asc' }],
        include: { company: { select: companySelect } },
      });
      const filtered = applyEmployeeTypeFilter(allRows);
      const items = await attachCompensationToItems(filtered.slice(offset, offset + limit).map(mapEmployee));
      const employeeTypes = Array.from(
        new Set(
          allRows
            .map((row) => employeeTypeFromProfileExtension(row.profileExtension)?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b));

      return successResponse({
        items,
        total: filtered.length,
        employeeTypes,
        stats: computeEmployeeDirectoryStats(filtered),
      });
    }

    const [total, list, typeRows, stats] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        orderBy: [{ fullName: 'asc' }],
        skip: offset,
        take: limit,
        include: { company: { select: companySelect } },
      }),
      prisma.employee.findMany({
        where: scope,
        select: { profileExtension: true },
        take: 2000,
      }),
      countEmployeeDirectoryStats(prisma, where),
    ]);

    const employeeTypes = Array.from(
      new Set(
        typeRows
          .map((row) => employeeTypeFromProfileExtension(row.profileExtension)?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return successResponse({
      items: await attachCompensationToItems(list.map(mapEmployee)),
      total,
      employeeTypes,
      stats,
    });
  }

  const list = await prisma.employee.findMany({
    where,
    orderBy: [{ fullName: 'asc' }],
    take: 500,
    include: { company: { select: companySelect } },
  });

  return successResponse(list.map(mapEmployee));
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const d = parsed.data;
  const authCtx = await requireHrSession({ permission: P.HR_EMPLOYEE_CREATE });
  if (!authCtx.ok) return authCtx.response;

  const writeCompanyId = resolveHrWriteCompanyId({
    requestedCompanyId: d.companyId,
    activeCompanyId: authCtx.session.user.activeCompanyId,
  });
  if (!writeCompanyId) {
    return errorResponse('companyId is required', 400);
  }
  if (!authCtx.companyIds.includes(writeCompanyId)) {
    return errorResponse('Forbidden', 403);
  }

  const companyId = writeCompanyId;
  const emailNorm = d.email ? d.email.trim().toLowerCase() : null;
  const auto = d.autoProvisionLogin !== false && Boolean(emailNorm);

  if (emailNorm) {
    const emailConflict = await checkEmployeeEmailUserConflict(prisma, { email: emailNorm });
    if (!emailConflict.ok) {
      return errorResponse(emailConflict.message, employeeEmailConflictStatus(emailConflict.code));
    }
  }

  let nationality: string | null = null;
  if (d.nationality !== undefined) {
    const parsedNationality = parseNationalityInput(d.nationality);
    if (!parsedNationality.ok) return errorResponse(parsedNationality.error, 422);
    nationality = parsedNationality.value;
  }

  try {
    const requestedCode = d.employeeCode?.trim() || '';
    const autoAllocate = !requestedCode;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < (autoAllocate ? 5 : 1); attempt++) {
      try {
        const employeeCode = autoAllocate
          ? (await allocateNextEmployeeCode(prisma, companyId)).code
          : requestedCode;

        const result = await prisma.$transaction(async (tx) => {
          const emp = await tx.employee.create({
            data: {
              companyId,
              employeeCode,
              fullName: d.fullName.trim(),
              preferredName: d.preferredName?.trim() || null,
              email: emailNorm,
              phone: d.phone?.trim() || null,
              nationality,
              dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
              gender: d.gender?.trim() || null,
              designation: d.designation?.trim() || null,
              department: d.department?.trim() || null,
              employmentType: d.employmentType?.trim() || null,
              signatureGroup: d.signatureGroup?.trim() || null,
              hireDate: d.hireDate ? new Date(d.hireDate) : null,
              terminationDate: d.terminationDate ? new Date(d.terminationDate) : null,
              status: d.status ?? 'ACTIVE',
              emergencyContactName: d.emergencyContactName?.trim() || null,
              emergencyContactPhone: d.emergencyContactPhone?.trim() || null,
              bloodGroup: d.bloodGroup?.trim() || null,
              photoUrl: d.photoUrl?.trim() || null,
              portalEnabled: auto ? true : (d.portalEnabled ?? false),
              adminNotes: d.adminNotes?.trim() || null,
              profileExtension:
                d.profileExtension === undefined
                  ? undefined
                  : (d.profileExtension as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput),
            },
          });

          let provision: { createdUser: boolean; userId: string } | null = null;
          if (auto && emailNorm) {
            const prov = await provisionEmployeeUser(tx, {
              employeeId: emp.id,
              companyId,
              email: emailNorm,
              fullName: emp.fullName,
            });
            if (!prov.ok) {
              throw new Error(`PROVISION:${prov.code}:${prov.message}`);
            }
            provision = { createdUser: prov.createdUser, userId: prov.userId };
          }

          return { emp, provision };
        });

        const full = await prisma.employee.findFirst({
          where: { id: result.emp.id },
          include: {
            userLink: { select: { id: true, email: true, name: true } },
            company: { select: companySelect },
          },
        });

        publishLiveUpdate({
          companyId,
          channel: 'hr',
          entity: 'employee',
          action: 'created',
        });

        return successResponse(
          {
            ...full,
            loginProvision: result.provision,
          },
          201,
        );
      } catch (e) {
        lastError = e;
        if (e instanceof Error && e.message.startsWith('PROVISION:')) throw e;
        const isUnique =
          e instanceof PrismaNS.PrismaClientKnownRequestError
            ? e.code === 'P2002'
            : e instanceof Error && e.message.includes('Unique constraint');
        if (!autoAllocate || !isUnique) throw e;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to allocate employee code');
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('PROVISION:')) {
      const parts = e.message.split(':');
      const code = parts[1];
      const msg = parts.slice(2).join(':') || 'Login provisioning failed';
      if (code === 'EMAIL_LINKED_OTHER') return errorResponse(msg, 409);
      if (code === 'EMAIL_USER_CONFLICT') return errorResponse(msg, 422);
      return errorResponse(msg, 422);
    }
    if (
      (e instanceof PrismaNS.PrismaClientKnownRequestError && e.code === 'P2002') ||
      (e instanceof Error && e.message.includes('Unique constraint'))
    ) {
      return errorResponse('Duplicate employee code or email for this company', 409);
    }
    throw e;
  }
}
