import { prisma } from '@/lib/db/prisma';

const GOOGLE_DRIVE_CONFIG_KEY = 'google_drive_config';

export type GlobalGoogleDriveConfig = {
  rootFolderId: string | null;
  refreshToken: string | null;
  connectedAt: string | null;
  connectedEmail: string | null;
};

function normalizeConfig(value: unknown): GlobalGoogleDriveConfig {
  const raw =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    rootFolderId:
      typeof raw.rootFolderId === 'string' && raw.rootFolderId.trim().length > 0
        ? raw.rootFolderId.trim()
        : null,
    refreshToken:
      typeof raw.refreshToken === 'string' && raw.refreshToken.trim().length > 0
        ? raw.refreshToken.trim()
        : null,
    connectedAt:
      typeof raw.connectedAt === 'string' && raw.connectedAt.trim().length > 0 ? raw.connectedAt.trim() : null,
    connectedEmail:
      typeof raw.connectedEmail === 'string' && raw.connectedEmail.trim().length > 0
        ? raw.connectedEmail.trim()
        : null,
  };
}

export async function getGlobalGoogleDriveConfig(): Promise<GlobalGoogleDriveConfig> {
  const row = await prisma.globalSetting.findUnique({
    where: { key: GOOGLE_DRIVE_CONFIG_KEY },
    select: { value: true },
  });
  return normalizeConfig(row?.value);
}

export async function setGlobalGoogleDriveConfig(next: Partial<GlobalGoogleDriveConfig>): Promise<GlobalGoogleDriveConfig> {
  const current = await getGlobalGoogleDriveConfig();
  const merged: GlobalGoogleDriveConfig = {
    rootFolderId: next.rootFolderId !== undefined ? next.rootFolderId : current.rootFolderId,
    refreshToken: next.refreshToken !== undefined ? next.refreshToken : current.refreshToken,
    connectedAt: next.connectedAt !== undefined ? next.connectedAt : current.connectedAt,
    connectedEmail: next.connectedEmail !== undefined ? next.connectedEmail : current.connectedEmail,
  };

  await prisma.globalSetting.upsert({
    where: { key: GOOGLE_DRIVE_CONFIG_KEY },
    update: { value: merged },
    create: { key: GOOGLE_DRIVE_CONFIG_KEY, value: merged },
  });
  return merged;
}

export async function getEffectiveGoogleDriveRootFolderId(): Promise<string | null> {
  const global = await getGlobalGoogleDriveConfig();
  return global.rootFolderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() ?? null;
}
