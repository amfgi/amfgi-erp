import 'dotenv/config';
import { auth } from '@/auth';
import { DELETE as deleteReceiptEntry } from '@/app/api/materials/receipt-history-entries/[receiptNumber]/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Receipt delete guard', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['transaction.stock_in'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('blocks deleting a receipt once any quantity from that batch has been consumed', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `REC-GUARD-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Receipt Guard Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `REC-GUARD-${Date.now().toString(36)}`,
        currentStock: 10,
        unitCost: 8,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 10,
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `REC-GUARD-BATCH-${Date.now().toString(36).toUpperCase()}`,
        receiptNumber: 'RCPT-GUARD-BLOCKED',
        quantityReceived: 10,
        quantityAvailable: 6,
        unitCost: 8,
        totalCost: 80,
        supplier: 'Receipt Guard Supplier',
        receivedDate: new Date('2026-04-10T00:00:00.000Z'),
      },
    });

    const response = await deleteReceiptEntry(
      new Request('http://localhost/api/materials/receipt-history-entries/RCPT-GUARD-BLOCKED', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ receiptNumber: 'RCPT-GUARD-BLOCKED' }) }
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(String(payload.error)).toContain('Receipt cannot be deleted because');

    const remainingBatch = await prisma.stockBatch.findFirst({
      where: {
        companyId: ctx.amfgiCompany.id,
        receiptNumber: 'RCPT-GUARD-BLOCKED',
      },
    });
    expect(remainingBatch).not.toBeNull();
  });

  it('allows deleting an untouched receipt and reverses stock balances', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `REC-GUARD-WH-OK-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Receipt Delete Material ${Date.now().toString(36)}`,
        unit: 'pcs',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `REC-OK-${Date.now().toString(36)}`,
        currentStock: 5,
        unitCost: 12,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 5,
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `REC-GUARD-OK-${Date.now().toString(36).toUpperCase()}`,
        receiptNumber: 'RCPT-GUARD-OK',
        quantityReceived: 5,
        quantityAvailable: 5,
        unitCost: 12,
        totalCost: 60,
        supplier: 'Receipt Delete Supplier',
        receivedDate: new Date('2026-04-11T00:00:00.000Z'),
      },
    });

    await prisma.transaction.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        type: 'STOCK_IN',
        quantity: 5,
        date: new Date('2026-04-11T00:00:00.000Z'),
        performedBy: ctx.admin.email,
        notes: '[RECEIPT:RCPT-GUARD-OK] seeded receipt transaction',
      },
    });

    const response = await deleteReceiptEntry(
      new Request('http://localhost/api/materials/receipt-history-entries/RCPT-GUARD-OK', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ receiptNumber: 'RCPT-GUARD-OK' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.deleted).toBe(true);

    const deletedBatch = await prisma.stockBatch.findFirst({
      where: {
        companyId: ctx.amfgiCompany.id,
        receiptNumber: 'RCPT-GUARD-OK',
      },
    });
    expect(deletedBatch).toBeNull();

    const updatedMaterial = await prisma.material.findUniqueOrThrow({
      where: { id: material.id },
      select: { currentStock: true },
    });
    expect(Number(updatedMaterial.currentStock)).toBe(0);

    const warehouseStock = await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: {
        companyId_materialId_warehouseId: {
          companyId: ctx.amfgiCompany.id,
          materialId: material.id,
          warehouseId: warehouse.id,
        },
      },
      select: { currentStock: true },
    });
    expect(Number(warehouseStock.currentStock)).toBe(0);

    const deletedTransaction = await prisma.transaction.findFirst({
      where: {
        companyId: ctx.amfgiCompany.id,
        type: 'STOCK_IN',
        notes: { contains: '[RECEIPT:RCPT-GUARD-OK]' },
      },
    });
    expect(deletedTransaction).toBeNull();
  });

  it('deletes receipt price logs and reverts unit cost when deleting an untouched receipt', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `REC-PRICE-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Receipt Price Material ${Date.now().toString(36)}`,
        unit: 'pcs',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `REC-PRICE-${Date.now().toString(36)}`,
        currentStock: 4,
        unitCost: 20,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 4,
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `REC-PRICE-BATCH-${Date.now().toString(36).toUpperCase()}`,
        receiptNumber: 'RCPT-PRICE-REVERT',
        quantityReceived: 4,
        quantityAvailable: 4,
        unitCost: 25,
        totalCost: 100,
        supplier: 'Receipt Price Supplier',
        receivedDate: new Date('2026-04-12T00:00:00.000Z'),
      },
    });

    await prisma.priceLog.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        previousPrice: 20,
        currentPrice: 25,
        source: 'bill',
        changedBy: ctx.admin.email,
        notes: 'Updated via goods receipt: RCPT-PRICE-REVERT',
      },
    });

    await prisma.material.update({
      where: { id: material.id },
      data: { unitCost: 25 },
    });

    const response = await deleteReceiptEntry(
      new Request('http://localhost/api/materials/receipt-history-entries/RCPT-PRICE-REVERT', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ receiptNumber: 'RCPT-PRICE-REVERT' }) }
    );

    expect(response.status).toBe(200);

    const remainingLog = await prisma.priceLog.findFirst({
      where: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        notes: 'Updated via goods receipt: RCPT-PRICE-REVERT',
      },
    });
    expect(remainingLog).toBeNull();

    const updatedMaterial = await prisma.material.findUniqueOrThrow({
      where: { id: material.id },
      select: { unitCost: true },
    });
    expect(Number(updatedMaterial.unitCost)).toBe(20);
  });
});
