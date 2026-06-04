import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

type Tx = PrismaClient | Prisma.TransactionClient;

export type TrackableMaterialInput = {
  id: string;
  label: string;
  unit?: string | null;
  targetValue: number;
  sourceKey?: string | null;
  finishedGoodMaterialId?: string | null;
  finishedGoodWarehouseId?: string | null;
};

type LinkWithDisplay = {
  id: string;
  jobItemId: string;
  trackerId: string;
  materialId: string;
  warehouseId: string;
  material: {
    id: string;
    name: string;
    unit: string;
    stockType: string;
  };
  warehouse: {
    id: string;
    name: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cleanTrackerForStorage(tracker: TrackableMaterialInput) {
  return {
    id: tracker.id,
    label: tracker.label,
    unit: tracker.unit ?? null,
    targetValue: tracker.targetValue,
    sourceKey: tracker.sourceKey ?? null,
  };
}

export function cleanTrackableItemsForStorage(
  items: TrackableMaterialInput[] | undefined
): Array<ReturnType<typeof cleanTrackerForStorage>> | undefined {
  return items?.map(cleanTrackerForStorage);
}

function parseTrackers(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function mergeLinksIntoTrackers(value: unknown, links: LinkWithDisplay[]) {
  const linkByTrackerId = new Map(links.map((link) => [link.trackerId, link]));
  return parseTrackers(value).map((tracker) => {
    const trackerId = String(tracker.id ?? '');
    const link = linkByTrackerId.get(trackerId);
    if (!link) return tracker;
    return {
      ...tracker,
      finishedGoodMaterialId: link.materialId,
      finishedGoodMaterialName: link.material.name,
      finishedGoodMaterialUnit: link.material.unit,
      finishedGoodMaterialStockType: link.material.stockType,
      finishedGoodWarehouseId: link.warehouseId,
      finishedGoodWarehouseName: link.warehouse.name,
    };
  });
}

export async function attachTrackableMaterialLinks<
  T extends { id: string; trackingItems: unknown },
>(db: Tx, companyId: string, items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  const links = await db.jobItemTrackableMaterialLink.findMany({
    where: {
      companyId,
      jobItemId: { in: items.map((item) => item.id) },
    },
    include: {
      material: {
        select: {
          id: true,
          name: true,
          unit: true,
          stockType: true,
        },
      },
      warehouse: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const linksByItemId = new Map<string, LinkWithDisplay[]>();
  for (const link of links) {
    const list = linksByItemId.get(link.jobItemId) ?? [];
    list.push(link);
    linksByItemId.set(link.jobItemId, list);
  }

  return items.map((item) => ({
    ...item,
    trackingItems: mergeLinksIntoTrackers(item.trackingItems, linksByItemId.get(item.id) ?? []),
  }));
}

export async function syncTrackableMaterialLinks(
  tx: Prisma.TransactionClient,
  companyId: string,
  jobItemId: string,
  trackingItems: TrackableMaterialInput[]
) {
  const existingLinks = await tx.jobItemTrackableMaterialLink.findMany({
    where: {
      companyId,
      jobItemId,
    },
  });
  const existingByTrackerId = new Map(existingLinks.map((link) => [link.trackerId, link]));
  const seenTrackerIds = new Set<string>();

  for (const tracker of trackingItems) {
    const trackerId = tracker.id.trim();
    if (!trackerId) continue;
    seenTrackerIds.add(trackerId);

    const materialId = tracker.finishedGoodMaterialId?.trim() || '';
    const explicitWarehouseId = tracker.finishedGoodWarehouseId?.trim() || '';
    const existing = existingByTrackerId.get(trackerId);

    if (!materialId) {
      if (!existing) continue;
      const postingCount = await tx.productionStockPosting.count({
        where: {
          companyId,
          trackableMaterialLinkId: existing.id,
        },
      });
      if (postingCount > 0) {
        throw new Error(`Cannot unlink finished goods for "${tracker.label}" because production stock has already been posted.`);
      }
      await tx.jobItemTrackableMaterialLink.delete({
        where: {
          companyId_jobItemId_trackerId: {
            companyId,
            jobItemId,
            trackerId,
          },
        },
      });
      continue;
    }

    const material = await tx.material.findFirst({
      where: {
        companyId,
        id: materialId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        warehouseId: true,
      },
    });
    if (!material) {
      throw new Error(`Finished goods material not found for "${tracker.label}".`);
    }

    const warehouseId = explicitWarehouseId || material.warehouseId || '';
    if (!warehouseId) {
      throw new Error(`Select a finished goods warehouse for "${tracker.label}".`);
    }

    const warehouse = await tx.warehouse.findFirst({
      where: {
        companyId,
        id: warehouseId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!warehouse) {
      throw new Error(`Finished goods warehouse not found for "${tracker.label}".`);
    }

    if (existing && (existing.materialId !== material.id || existing.warehouseId !== warehouse.id)) {
      const postingCount = await tx.productionStockPosting.count({
        where: {
          companyId,
          trackableMaterialLinkId: existing.id,
        },
      });
      if (postingCount > 0) {
        throw new Error(`Cannot change finished goods for "${tracker.label}" because production stock has already been posted.`);
      }
    }

    await tx.jobItemTrackableMaterialLink.upsert({
      where: {
        companyId_jobItemId_trackerId: {
          companyId,
          jobItemId,
          trackerId,
        },
      },
      create: {
        id: randomUUID(),
        companyId,
        jobItemId,
        trackerId,
        materialId: material.id,
        warehouseId: warehouse.id,
        updatedAt: new Date(),
      },
      update: {
        materialId: material.id,
        warehouseId: warehouse.id,
      },
    });
  }

  for (const existing of existingLinks) {
    if (seenTrackerIds.has(existing.trackerId)) continue;
    const postingCount = await tx.productionStockPosting.count({
      where: {
        companyId,
        trackableMaterialLinkId: existing.id,
      },
    });
    if (postingCount > 0) {
      throw new Error('Cannot remove a trackable item after production stock has been posted.');
    }
    await tx.jobItemTrackableMaterialLink.delete({
      where: {
        companyId_jobItemId_trackerId: {
          companyId,
          jobItemId,
          trackerId: existing.trackerId,
        },
      },
    });
  }
}
