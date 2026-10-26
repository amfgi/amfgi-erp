import { z } from 'zod';

import type { SalesAccess } from './access';
import { findSalesUser } from './salesUsers';
import { createSalesQuery, forwardToQuotation, SalesError } from './service';

export const integrationSalesAccess: SalesAccess = {
  queryView: true,
  queryManage: true,
  quotationView: true,
  quotationManage: true,
  purchaseOrdersView: false,
  purchaseOrdersManage: false,
  customerView: true,
  customerCreate: true,
  customerEdit: false,
  jobCreate: false,
};

export const integrationSalesQuerySchema = z
  .object({
    companyExternalId: z.string().trim().min(1),
    customerId: z.string().trim().min(1).optional().nullable(),
    customer: z
      .object({
        name: z.string().trim().min(1).max(100),
        phone: z.string().trim().min(1).max(30),
        contactPerson: z.string().trim().max(100).optional().nullable(),
      })
      .optional()
      .nullable(),
    projectLocation: z.string().trim().min(1).max(200),
    projectDescription: z.string().trim().min(1).max(1000),
    projectScope: z.string().trim().min(1).max(500),
    extraNotes: z.string().max(5000).optional().nullable(),
    salesmanId: z.string().trim().min(1),
    forwardToQuotation: z.boolean().optional().default(false),
    assigneeId: z.string().trim().min(1).optional().nullable(),
    requestedBy: z.string().trim().max(120).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    const hasId = Boolean(value.customerId?.trim());
    const hasCustomer = Boolean(value.customer);
    if (hasId && hasCustomer) {
      ctx.addIssue({ code: 'custom', message: 'Send customerId or customer, not both' });
    } else if (!hasId && !hasCustomer) {
      ctx.addIssue({
        code: 'custom',
        message: 'Send customerId or a new customer with name and phone',
      });
    }
    if (value.forwardToQuotation && !value.assigneeId?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'assigneeId is required when forwardToQuotation is true',
      });
    }
  });

export type IntegrationSalesQueryInput = z.infer<typeof integrationSalesQuerySchema>;

function sourceNote(requestedBy?: string | null) {
  const name = requestedBy?.trim();
  return name ? `Customer service API. Requested by ${name}` : 'Customer service API';
}

export async function createIntegratedSalesQuery(companyId: string, input: IntegrationSalesQueryInput) {
  const salesman = await findSalesUser(companyId, input.salesmanId);
  if (!salesman) throw new SalesError('Choose an active user who has a sales permission.');

  const assigneeId = input.assigneeId?.trim() || '';
  if (input.forwardToQuotation) {
    const assignee = await findSalesUser(companyId, assigneeId);
    if (!assignee) throw new SalesError('Choose an active user who has a sales permission.');
  }

  const note = sourceNote(input.requestedBy);
  const created = await createSalesQuery({
    companyId,
    userId: salesman.id,
    access: integrationSalesAccess,
    customerId: input.customerId,
    newCustomer: input.customer
      ? {
          name: input.customer.name,
          phone: input.customer.phone,
          contactPerson: input.customer.contactPerson,
        }
      : null,
    projectLocation: input.projectLocation,
    projectDescription: input.projectDescription,
    projectScope: input.projectScope,
    salesmanId: salesman.id,
    extraNotes: input.extraNotes,
    logDetail: note,
  });

  const record = input.forwardToQuotation
    ? await forwardToQuotation({
        companyId,
        id: created.id,
        access: integrationSalesAccess,
        assigneeId,
        actorId: salesman.id,
        sourceNote: note,
      })
    : created;

  return {
    id: record.id,
    queryNumber: record.queryNumber,
    customerId: record.customerId,
    customerCreated: created.customerCreated,
    stage: record.stage,
    salesman: { id: record.salesman.id, name: record.salesman.name },
    ...(input.forwardToQuotation
      ? {
          quotationNumber: record.quotationNumber,
          assignedTo: record.assignedTo ? { id: record.assignedTo.id, name: record.assignedTo.name } : null,
        }
      : {}),
  };
}
