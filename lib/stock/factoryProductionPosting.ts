import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { buildTransactionActorFields, type AuditActorUser } from '@/lib/utils/auditActor';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { applyMaterialWarehouseDelta } from '@/lib/warehouses/stockWarehouses';

const FACTORY_REFERENCE_TYPE = 'FACTORY_PRODUCTION';

type Tx = Prisma.TransactionClient;

export type FactoryProductionLineInput = {
  materialId: string;
  quantity: number;
};

type PostFactoryProductionParams = {
  companyId: string;
  productionDate: Date;
  warehouseId: string;
  notes: string | null;
  lines: FactoryProductionLineInput[];
  user: AuditActorUser & { id: string };
};

function batchNumber(productionId: string, index: number) {
  return `FP-${productionId.slice(-8).toUpperCase()}-${index + 1}-${Date.now().toString(36).toUpperCase()}`;
}

export async function postFactoryProduction(tx: Tx, params: PostFactoryProductionParams) {
  const warehouse = await tx.warehouse.findFirst({
    where: { id: params.warehouseId, companyId: params.companyId, isActive: true },
    select: { id: true, name: true },
  });
  if (!warehouse) throw new Error('Warehouse not found');

  const materialIds = params.lines.map((line) => line.materialId);
  if (new Set(materialIds).size !== materialIds.length) {
    throw new Error('Each material can appear only once on a production entry');
  }

  const materials = await tx.material.findMany({
    where: { companyId: params.companyId, id: { in: materialIds }, isActive: true },
    select: { id: true, name: true, unit: true, unitCost: true },
  });
  const materialById = new Map(materials.map((material) => [material.id, material]));
  for (const line of params.lines) {
    if (!materialById.has(line.materialId)) {
      throw new Error('Material not found');
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error('Each line needs a quantity greater than zero');
    }
  }

  const productionId = randomUUID();
  const actorFields = buildTransactionActorFields(params.user);
  const noteBase = params.notes?.trim() || 'Factory production';

  await tx.factoryProduction.create({
    data: {
      id: productionId,
      companyId: params.companyId,
      productionDate: params.productionDate,
      warehouseId: warehouse.id,
      notes: params.notes,
      createdById: params.user.id,
      updatedAt: new Date(),
    },
  });

  const postedLines = [];
  for (const [index, line] of params.lines.entries()) {
    const material = materialById.get(line.materialId)!;
    const unitCost = decimalToNumberOrZero(material.unitCost);
    const totalCost = unitCost * line.quantity;
    const note = `${noteBase}: ${material.name} [FACTORY_PRODUCTION:${productionId}]`;
    const batchId = randomUUID();
    const transactionId = randomUUID();
    const batchNo = batchNumber(productionId, index);

    await tx.material.update({
      where: { id: material.id },
      data: { currentStock: { increment: line.quantity } },
    });
    await applyMaterialWarehouseDelta(tx, params.companyId, material.id, warehouse.id, line.quantity);

    await tx.stockBatch.create({
      data: {
        id: batchId,
        companyId: params.companyId,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: batchNo,
        quantityReceived: line.quantity,
        quantityAvailable: line.quantity,
        unitCost,
        totalCost,
        supplier: 'Factory production',
        receivedDate: params.productionDate,
        notes: note,
        updatedAt: new Date(),
      },
    });

    await tx.transaction.create({
      data: {
        id: transactionId,
        companyId: params.companyId,
        type: 'STOCK_IN',
        materialId: material.id,
        warehouseId: warehouse.id,
        quantity: line.quantity,
        notes: note,
        date: params.productionDate,
        totalCost,
        averageCost: unitCost,
        sourceModule: 'factory-production',
        referenceType: FACTORY_REFERENCE_TYPE,
        referenceId: productionId,
        meta: { factoryProductionId: productionId, stockBatchId: batchId },
        updatedAt: new Date(),
        ...actorFields,
      },
    });

    const createdLine = await tx.factoryProductionLine.create({
      data: {
        id: randomUUID(),
        companyId: params.companyId,
        factoryProductionId: productionId,
        materialId: material.id,
        quantity: line.quantity,
        transactionId,
        stockBatchId: batchId,
      },
    });

    postedLines.push({
      id: createdLine.id,
      materialId: material.id,
      materialName: material.name,
      unit: material.unit,
      quantity: line.quantity,
    });
  }

  return {
    id: productionId,
    productionDate: params.productionDate.toISOString().slice(0, 10),
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    notes: params.notes,
    lines: postedLines,
  };
}
