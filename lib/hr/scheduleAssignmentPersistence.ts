import { prisma } from '@/lib/db/prisma';
import { nullableDecimalToNumber } from '@/lib/utils/decimal';
import { z } from 'zod';

export const ScheduleMemberSchema = z.object({
  employeeId: z.string().min(1),
  role: z.enum(['WORKER', 'HELPER', 'TEAM_LEADER']).default('WORKER'),
  slot: z.number().int().min(0).max(99999).optional(),
});

export const ScheduleAssignmentInputSchema = z.object({
  columnIndex: z.number().int().min(1).max(99),
  label: z.string().min(1).max(80),
  locationType: z.enum(['SITE_JOB', 'FACTORY', 'OTHER']),
  jobId: z.string().optional().nullable(),
  factoryCode: z.string().max(120).optional().nullable(),
  factoryLabel: z.string().max(200).optional().nullable(),
  jobNumberSnapshot: z.string().max(120).optional().nullable(),
  siteNameSnapshot: z.string().max(200).optional().nullable(),
  clientNameSnapshot: z.string().max(200).optional().nullable(),
  projectDetailsSnapshot: z.string().max(5000).optional().nullable(),
  teamLeaderEmployeeId: z.string().optional().nullable(),
  driver1EmployeeId: z.string().optional().nullable(),
  driver2EmployeeId: z.string().optional().nullable(),
  shiftStart: z.string().max(40).optional().nullable(),
  shiftEnd: z.string().max(40).optional().nullable(),
  breakWindow: z.string().max(80).optional().nullable(),
  targetQty: z.number().optional().nullable(),
  achievedQty: z.number().optional().nullable(),
  unit: z.string().max(40).optional().nullable(),
  remarks: z.string().max(5000).optional().nullable(),
  members: z.array(ScheduleMemberSchema).default([]),
});

export type ScheduleAssignmentInput = z.infer<typeof ScheduleAssignmentInputSchema>;

export const assignmentDetailInclude = {
  members: { include: { employee: { select: { id: true, fullName: true, employeeCode: true } } } },
  job: {
    select: {
      id: true,
      jobNumber: true,
      site: true,
      description: true,
      projectDetails: true,
      projectType: true,
      projectQtyArea: true,
      customer: { select: { name: true } },
    },
  },
  teamLeader: { select: { id: true, fullName: true } },
  driver1: { select: { id: true, fullName: true } },
  driver2: { select: { id: true, fullName: true } },
} as const;

export async function validateScheduleAssignmentReferences(companyId: string, assignment: ScheduleAssignmentInput) {
  if (assignment.jobId) {
    const job = await prisma.job.findFirst({ where: { id: assignment.jobId, companyId } });
    if (!job) return `Invalid jobId for column ${assignment.columnIndex}`;
  }
  const empIds = new Set<string>();
  if (assignment.teamLeaderEmployeeId) empIds.add(assignment.teamLeaderEmployeeId);
  if (assignment.driver1EmployeeId) empIds.add(assignment.driver1EmployeeId);
  if (assignment.driver2EmployeeId) empIds.add(assignment.driver2EmployeeId);
  for (const member of assignment.members) empIds.add(member.employeeId);
  if (empIds.size > 0) {
    const count = await prisma.employee.count({
      where: { companyId, id: { in: [...empIds] } },
    });
    if (count !== empIds.size) return `Invalid employee reference in column ${assignment.columnIndex}`;
  }
  return null;
}

function assignmentDataRow(companyId: string, workScheduleId: string, assignment: ScheduleAssignmentInput) {
  return {
    companyId,
    workScheduleId,
    columnIndex: assignment.columnIndex,
    label: assignment.label.trim(),
    locationType: assignment.locationType,
    jobId: assignment.jobId ?? null,
    factoryCode: assignment.factoryCode?.trim() || null,
    factoryLabel: assignment.factoryLabel?.trim() || null,
    jobNumberSnapshot: assignment.jobNumberSnapshot?.trim() || null,
    siteNameSnapshot: assignment.siteNameSnapshot?.trim() || null,
    clientNameSnapshot: assignment.clientNameSnapshot?.trim() || null,
    projectDetailsSnapshot: assignment.projectDetailsSnapshot?.trim() || null,
    teamLeaderEmployeeId: assignment.teamLeaderEmployeeId ?? null,
    driver1EmployeeId: assignment.driver1EmployeeId ?? null,
    driver2EmployeeId: assignment.driver2EmployeeId ?? null,
    shiftStart: assignment.shiftStart?.trim() || null,
    shiftEnd: assignment.shiftEnd?.trim() || null,
    breakWindow: assignment.breakWindow?.trim() || null,
    targetQty: nullableDecimalToNumber(assignment.targetQty),
    achievedQty: nullableDecimalToNumber(assignment.achievedQty),
    unit: assignment.unit?.trim() || null,
    remarks: assignment.remarks?.trim() || null,
  };
}

function memberRowsForAssignment(companyId: string, workAssignmentId: string, assignment: ScheduleAssignmentInput) {
  const seen = new Set<string>();
  return assignment.members.flatMap((member) => {
    if (seen.has(member.employeeId)) return [];
    seen.add(member.employeeId);
    return {
      companyId,
      workAssignmentId,
      employeeId: member.employeeId,
      role: member.role,
      slot: member.slot ?? 0,
    };
  });
}

export async function upsertScheduleAssignment(
  companyId: string,
  workScheduleId: string,
  assignment: ScheduleAssignmentInput,
) {
  const existing = await prisma.workAssignment.findFirst({
    where: { workScheduleId, columnIndex: assignment.columnIndex },
    select: { id: true },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.workAssignmentMember.deleteMany({ where: { workAssignmentId: existing.id } }),
      prisma.workAssignment.update({
        where: { id: existing.id },
        data: assignmentDataRow(companyId, workScheduleId, assignment),
      }),
    ]);
    const memberRows = memberRowsForAssignment(companyId, existing.id, assignment);
    if (memberRows.length > 0) {
      await prisma.workAssignmentMember.createMany({ data: memberRows });
    }
    return existing.id;
  }

  const created = await prisma.workAssignment.create({
    data: assignmentDataRow(companyId, workScheduleId, assignment),
    select: { id: true },
  });
  const memberRows = memberRowsForAssignment(companyId, created.id, assignment);
  if (memberRows.length > 0) {
    await prisma.workAssignmentMember.createMany({ data: memberRows });
  }
  return created.id;
}

export async function deleteScheduleAssignmentsByColumnIndexes(workScheduleId: string, columnIndexes: number[]) {
  if (columnIndexes.length === 0) return;
  const rows = await prisma.workAssignment.findMany({
    where: { workScheduleId, columnIndex: { in: columnIndexes } },
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return;
  await prisma.$transaction([
    prisma.workAssignmentMember.deleteMany({ where: { workAssignmentId: { in: ids } } }),
    prisma.workAssignment.deleteMany({ where: { id: { in: ids } } }),
  ]);
}

export async function pruneScheduleAssignmentsExcept(workScheduleId: string, keepColumnIndexes: number[]) {
  const toDelete = await prisma.workAssignment.findMany({
    where: {
      workScheduleId,
      ...(keepColumnIndexes.length > 0 ? { columnIndex: { notIn: keepColumnIndexes } } : {}),
    },
    select: { id: true },
  });
  const ids = toDelete.map((row) => row.id);
  if (ids.length === 0) return;
  await prisma.$transaction([
    prisma.workAssignmentMember.deleteMany({ where: { workAssignmentId: { in: ids } } }),
    prisma.workAssignment.deleteMany({ where: { id: { in: ids } } }),
  ]);
}

export async function fetchScheduleAssignmentByColumn(workScheduleId: string, columnIndex: number) {
  return prisma.workAssignment.findFirst({
    where: { workScheduleId, columnIndex },
    include: assignmentDetailInclude,
  });
}

export async function fetchScheduleAssignments(workScheduleId: string) {
  return prisma.workAssignment.findMany({
    where: { workScheduleId },
    orderBy: { columnIndex: 'asc' },
    include: assignmentDetailInclude,
  });
}
