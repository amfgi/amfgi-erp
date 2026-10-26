import { z } from 'zod';

const lineFieldSchema = z.object({
  label: z.string().trim().max(80),
  value: z.string().max(500).optional().nullable(),
});

const optionLineSchema = z.object({
  item: z.string().max(200),
  description: z.string().max(2000).optional().nullable(),
  unitPrice: z.number().finite(),
  quantity: z.number().finite(),
  fields: z.array(lineFieldSchema).optional().default([]),
});

const optionSchema = z.object({
  name: z.string().max(120).optional().default(''),
  vatAmount: z.number().finite().default(0),
  lines: z.array(optionLineSchema).default([]),
});

export const newCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Enter the new customer name').max(100),
  phone: z.string().trim().min(1, 'Enter a phone number for the new customer').max(30),
  contactPerson: z.string().max(100).optional().nullable(),
});

export const createSalesSchema = z.object({
  customerId: z.string().optional().nullable(),
  newCustomer: newCustomerSchema.optional().nullable(),
  projectLocation: z.string().min(1).max(200),
  projectDescription: z.string().min(1).max(1000),
  projectScope: z.string().min(1).max(500),
  salesmanId: z.string().min(1),
  extraNotes: z.string().max(5000).optional().nullable(),
});

export const updateSalesSchema = z.object({
  projectLocation: z.string().min(1).max(200).optional(),
  projectDescription: z.string().min(1).max(1000).optional(),
  projectScope: z.string().min(1).max(500).optional(),
  salesmanId: z.string().min(1).optional(),
  extraNotes: z.string().max(5000).optional().nullable(),
  customerId: z.string().optional().nullable(),
  newCustomer: newCustomerSchema.optional().nullable(),
  startDate: z.string().optional().nullable(),
  quotationMode: z.enum(['SINGLE', 'MULTIPLE']).optional(),
  options: z.array(optionSchema).optional(),
  budgetDetails: z.string().max(8000).optional().nullable(),
  purchaseOrderNotes: z.string().max(8000).optional().nullable(),
  poDate: z.string().optional().nullable(),
  poValue: z.number().finite().optional().nullable(),
  quotationDocument: z.unknown().optional(),
});

export const receivePurchaseOrderSchema = z.object({
  acceptedOptionId: z.string().optional().nullable(),
});

export const closureSchema = z.object({
  closure: z.enum(['OPEN', 'LOST', 'CANCELLED', 'REJECTED']),
  reason: z.string().max(2000).optional().nullable(),
});

export const createJobSchema = z.object({
  poDate: z.string().min(1, 'Enter the PO date'),
  poValue: z.number().finite().positive('Enter a PO value greater than zero'),
  email: z.union([z.string().email(), z.literal('')]).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  tradeLicenseNumber: z.string().max(255).optional().nullable(),
  tradeLicenseAuthority: z.string().max(255).optional().nullable(),
  tradeLicenseExpiry: z.string().max(40).optional().nullable(),
  trnNumber: z.string().max(255).optional().nullable(),
  trnExpiry: z.string().max(40).optional().nullable(),
});
