import 'dotenv/config';
import { auth } from '@/auth';
import { randomUUID } from 'crypto';
import { POST as addJobItem, GET as getJobItems } from '@/app/api/jobs/[id]/items/route';
import { POST as addProgressEntry } from '@/app/api/jobs/[id]/items/[itemId]/progress-entries/route';
import {
  DELETE as deleteProgressEntry,
  PUT as updateProgressEntry,
} from '@/app/api/jobs/[id]/items/[itemId]/progress-entries/[entryId]/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

async function createBudgetFixture(ctx: TestContext) {
  const token = Date.now().toString(36).toUpperCase();
  const now = new Date();
  const warehouse = await prisma.warehouse.create({
    data: {
      id: randomUUID(),
      companyId: ctx.amfgiCompany.id,
      name: `Production WH ${token}`,
      isActive: true,
      updatedAt: now,
    },
  });
  const customer = await prisma.customer.create({
    data: {
      id: randomUUID(),
      companyId: ctx.amfgiCompany.id,
      name: `Production Customer ${token}`,
      updatedAt: now,
    },
  });
  const job = await prisma.job.create({
    data: {
      id: randomUUID(),
      companyId: ctx.amfgiCompany.id,
      jobNumber: `PROD-JOB-${token}`,
      customerId: customer.id,
      status: 'ACTIVE',
      createdBy: ctx.admin.id,
      updatedAt: now,
    },
  });
  const finishedGood = await prisma.material.create({
    data: {
      id: randomUUID(),
      companyId: ctx.amfgiCompany.id,
      name: `Finished Good ${token}`,
      unit: 'pcs',
      category: 'Finished Goods',
      warehouse: warehouse.name,
      warehouseId: warehouse.id,
      stockType: 'Finished Goods',
      currentStock: 0,
      unitCost: 25,
      updatedAt: now,
    },
  });
  const formula = await prisma.formulaLibrary.create({
    data: {
      id: randomUUID(),
      companyId: ctx.amfgiCompany.id,
      name: `Production Formula ${token}`,
      slug: `production-formula-${token.toLowerCase()}`,
      fabricationType: 'Production',
      formulaConfig: {
        version: 1,
        areas: [],
      },
      specificationSchema: {
        globalFields: [{ key: 'qty', label: 'Qty', inputType: 'number', required: true }],
        areas: [],
      },
      isActive: true,
      createdBy: ctx.admin.id,
      updatedAt: now,
    },
  });

  const addItemResponse = await addJobItem(
    new Request(`http://localhost/api/jobs/${job.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Fabricated panels',
        formulaLibraryId: formula.id,
        specifications: {
          global: { qty: 10 },
          areas: {},
        },
        trackingItems: [
          {
            id: 'tracker-panels',
            label: 'Panels',
            unit: 'pcs',
            targetValue: 10,
            sourceKey: null,
            finishedGoodMaterialId: finishedGood.id,
            finishedGoodWarehouseId: warehouse.id,
          },
        ],
        trackingEnabled: true,
      }),
    }),
    { params: Promise.resolve({ id: job.id }) }
  );
  expect(addItemResponse.status).toBe(201);
  const addItemPayload = await addItemResponse.json();

  return {
    warehouse,
    customer,
    job,
    finishedGood,
    formula,
    jobItemId: addItemPayload.data.id as string,
  };
}

describe('production finished goods stock posting', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['job.view', 'job.edit', 'material.view', 'transaction.stock_in', 'transaction.stock_out'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('returns budget tracker links and posts stock on production entry lifecycle', async () => {
    const fixture = await createBudgetFixture(ctx);

    const getItemsResponse = await getJobItems(
      new Request(`http://localhost/api/jobs/${fixture.job.id}/items`),
      { params: Promise.resolve({ id: fixture.job.id }) }
    );
    expect(getItemsResponse.status).toBe(200);
    const itemsPayload = await getItemsResponse.json();
    expect(itemsPayload.data.items[0].trackingItems[0].finishedGoodMaterialId).toBe(fixture.finishedGood.id);
    expect(itemsPayload.data.items[0].trackingItems[0].finishedGoodWarehouseId).toBe(fixture.warehouse.id);

    const addEntryResponse = await addProgressEntry(
      new Request(`http://localhost/api/jobs/${fixture.job.id}/items/${fixture.jobItemId}/progress-entries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trackerId: 'tracker-panels',
          entryDate: '2026-05-25',
          quantity: 4,
        }),
      }),
      { params: Promise.resolve({ id: fixture.job.id, itemId: fixture.jobItemId }) }
    );
    expect(addEntryResponse.status).toBe(201);
    const entryPayload = await addEntryResponse.json();
    const entryId = entryPayload.data.id as string;

    let material = await prisma.material.findUniqueOrThrow({ where: { id: fixture.finishedGood.id } });
    expect(Number(material.currentStock)).toBe(4);

    let posting = await prisma.productionStockPosting.findUniqueOrThrow({
      where: { companyId_progressEntryId: { companyId: ctx.amfgiCompany.id, progressEntryId: entryId } },
      include: { transaction: true, stockBatch: true },
    });
    expect(posting.status).toBe('POSTED');
    expect(Number(posting.quantity)).toBe(4);
    expect(posting.transaction.sourceModule).toBe('production');
    expect(posting.transaction.referenceType).toBe('JOB_ITEM_PROGRESS_ENTRY');
    expect(Number(posting.stockBatch.quantityAvailable)).toBe(4);

    const updateResponse = await updateProgressEntry(
      new Request(`http://localhost/api/jobs/${fixture.job.id}/items/${fixture.jobItemId}/progress-entries/${entryId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantity: 6 }),
      }),
      { params: Promise.resolve({ id: fixture.job.id, itemId: fixture.jobItemId, entryId }) }
    );
    expect(updateResponse.status).toBe(200);

    material = await prisma.material.findUniqueOrThrow({ where: { id: fixture.finishedGood.id } });
    expect(Number(material.currentStock)).toBe(6);
    posting = await prisma.productionStockPosting.findUniqueOrThrow({
      where: { companyId_progressEntryId: { companyId: ctx.amfgiCompany.id, progressEntryId: entryId } },
      include: { transaction: true, stockBatch: true },
    });
    expect(Number(posting.quantity)).toBe(6);
    expect(Number(posting.transaction.quantity)).toBe(6);
    expect(Number(posting.stockBatch.quantityAvailable)).toBe(6);

    const deleteResponse = await deleteProgressEntry(
      new Request(`http://localhost/api/jobs/${fixture.job.id}/items/${fixture.jobItemId}/progress-entries/${entryId}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: fixture.job.id, itemId: fixture.jobItemId, entryId }) }
    );
    expect(deleteResponse.status).toBe(200);

    material = await prisma.material.findUniqueOrThrow({ where: { id: fixture.finishedGood.id } });
    expect(Number(material.currentStock)).toBe(0);
    posting = await prisma.productionStockPosting.findUniqueOrThrow({
      where: { companyId_progressEntryId: { companyId: ctx.amfgiCompany.id, progressEntryId: entryId } },
      include: { transaction: true, stockBatch: true },
    });
    expect(posting.status).toBe('REVERSED');
    expect(posting.reversalTransactionId).toBeTruthy();
    expect(Number(posting.stockBatch.quantityAvailable)).toBe(0);
  });

  it('blocks reducing produced stock after the produced batch has been dispatched', async () => {
    const fixture = await createBudgetFixture(ctx);

    const addEntryResponse = await addProgressEntry(
      new Request(`http://localhost/api/jobs/${fixture.job.id}/items/${fixture.jobItemId}/progress-entries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trackerId: 'tracker-panels',
          entryDate: '2026-05-25',
          quantity: 5,
        }),
      }),
      { params: Promise.resolve({ id: fixture.job.id, itemId: fixture.jobItemId }) }
    );
    expect(addEntryResponse.status).toBe(201);
    const entryPayload = await addEntryResponse.json();
    const entryId = entryPayload.data.id as string;

    const posting = await prisma.productionStockPosting.findUniqueOrThrow({
      where: { companyId_progressEntryId: { companyId: ctx.amfgiCompany.id, progressEntryId: entryId } },
    });
    await prisma.$transaction(async (tx) => {
      await tx.stockBatch.update({
        where: { id: posting.stockBatchId },
        data: { quantityAvailable: { decrement: 3 } },
      });
      await tx.material.update({
        where: { id: fixture.finishedGood.id },
        data: { currentStock: { decrement: 3 } },
      });
      await tx.materialWarehouseStock.update({
        where: {
          companyId_materialId_warehouseId: {
            companyId: ctx.amfgiCompany.id,
            materialId: fixture.finishedGood.id,
            warehouseId: fixture.warehouse.id,
          },
        },
        data: { currentStock: { decrement: 3 } },
      });
      await tx.transaction.create({
        data: {
          id: randomUUID(),
          companyId: ctx.amfgiCompany.id,
          type: 'STOCK_OUT',
          materialId: fixture.finishedGood.id,
          warehouseId: fixture.warehouse.id,
          quantity: 3,
          jobId: fixture.job.id,
          date: new Date('2026-05-26T00:00:00.000Z'),
          performedBy: ctx.admin.id,
          updatedAt: new Date(),
        },
      });
    });

    const updateResponse = await updateProgressEntry(
      new Request(`http://localhost/api/jobs/${fixture.job.id}/items/${fixture.jobItemId}/progress-entries/${entryId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantity: 1 }),
      }),
      { params: Promise.resolve({ id: fixture.job.id, itemId: fixture.jobItemId, entryId }) }
    );
    expect(updateResponse.status).toBe(400);
    const updatePayload = await updateResponse.json();
    expect(updatePayload.error).toContain('produced batch has already been dispatched');
  });
});
