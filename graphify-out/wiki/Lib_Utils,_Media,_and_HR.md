# Lib Utils, Media, and HR

> 23 nodes · cohesion 0.17

## Key Concepts

- **prisma.ts** (15 connections) — `lib/db/prisma.ts`
- **route.ts** (10 connections) — `app/api/media/cleanup/route.ts`
- **route.ts** (10 connections) — `app/api/media/[id]/route.ts`
- **convertGoogleDriveUrl()** (10 connections) — `lib/utils/googleDriveUrl.ts`
- **route.ts** (9 connections) — `app/api/media/route.ts`
- **googleDriveUrl.ts** (9 connections) — `lib/utils/googleDriveUrl.ts`
- **extractGoogleDriveFileId()** (9 connections) — `lib/utils/googleDriveUrl.ts`
- **DELETE()** (8 connections) — `app/api/settings/api-credentials/[id]/route.ts`
- **requireCompanySession.ts** (8 connections) — `lib/hr/requireCompanySession.ts`
- **requireCompanySession()** (8 connections) — `lib/hr/requireCompanySession.ts`
- **driveFileIdToDisplayUrl()** (7 connections) — `lib/utils/googleDriveUrl.ts`
- **POST()** (6 connections) — `app/api/media/cleanup/route.ts`
- **userScopedMedia.ts** (6 connections) — `lib/media/userScopedMedia.ts`
- **finalizeUserMediaUpload()** (6 connections) — `lib/media/userScopedMedia.ts`
- **GET()** (4 connections) — `app/api/media/route.ts`
- **finalizeUserMediaUpload()** (4 connections) — `lib/media/userScopedMedia.ts`
- **resolveBoundFieldImageSrc()** (4 connections) — `lib/utils/googleDriveUrl.ts`
- **googleDriveUrl.ts** (4 connections) — `lib/utils/googleDriveUrl.ts`
- **canAccess()** (2 connections) — `app/api/media/route.ts`
- **canAccess()** (2 connections) — `app/api/media/cleanup/route.ts`
- **canAccess()** (2 connections) — `app/api/media/[id]/route.ts`
- **UserMediaKind** (1 connections) — `lib/media/userScopedMedia.ts`
- **userScopedMedia.ts** (1 connections) — `lib/media/userScopedMedia.ts`

## Relationships

- [[API Companies, Settings, and Materials]] (20 shared connections)
- [[Lib Utils]] (10 shared connections)
- [[API HR, User, and Jobs]] (6 shared connections)
- [[API HR, Materials, and Upload]] (5 shared connections)
- [[API HR, Jobs, and Materials]] (4 shared connections)
- [[Lib Integrations]] (4 shared connections)
- [[API Media]] (3 shared connections)
- [[Lib Utils, HR, and Material Master Data]] (3 shared connections)
- [[API Reports, Materials, and HR]] (2 shared connections)
- [[Lib Integrations, Party Lists API, and Party List Sync]] (2 shared connections)
- [[Lib, Integrations, and Party Upsert Service]] (1 shared connections)
- [[Lib, Live Updates, and Server]] (1 shared connections)

## Source Files

- `app/api/media/[id]/route.ts`
- `app/api/media/cleanup/route.ts`
- `app/api/media/route.ts`
- `app/api/settings/api-credentials/[id]/route.ts`
- `lib/db/prisma.ts`
- `lib/hr/requireCompanySession.ts`
- `lib/media/userScopedMedia.ts`
- `lib/utils/googleDriveUrl.ts`

## Audit Trail

- EXTRACTED: 121 (83%)
- INFERRED: 24 (17%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*