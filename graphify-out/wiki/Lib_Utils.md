# Lib Utils

> 28 nodes · cohesion 0.15

## Key Concepts

- **googleDrive.ts** (50 connections) — `lib/utils/googleDrive.ts`
- **POST()** (19 connections) — `app/api/transactions/batch/route.ts`
- **sanitizeFolderName()** (11 connections) — `lib/utils/googleDrive.ts`
- **ensureFolderPath()** (9 connections) — `lib/utils/googleDrive.ts`
- **route.ts** (8 connections) — `app/api/settings/google-drive/oauth/callback/route.ts`
- **moveDriveFile()** (8 connections) — `lib/utils/googleDrive.ts`
- **route.ts** (7 connections) — `app/api/settings/google-drive/oauth/start/route.ts`
- **createOAuthClient()** (6 connections) — `lib/utils/googleDrive.ts`
- **getDriveClientForCompany()** (6 connections) — `lib/utils/googleDrive.ts`
- **buildCustomerDriveFolderName()** (6 connections) — `lib/utils/googleDrive.ts`
- **buildJobDriveFolderName()** (6 connections) — `lib/utils/googleDrive.ts`
- **buildSignedDeliveryNoteDriveFileName()** (6 connections) — `lib/utils/googleDrive.ts`
- **GET()** (5 connections) — `app/api/settings/google-drive/oauth/callback/route.ts`
- **driveFileIdToDisplayUrl()** (5 connections) — `lib/utils/googleDriveUrl.ts`
- **GET()** (4 connections) — `app/api/settings/google-drive/oauth/start/route.ts`
- **ensureChildFolder()** (4 connections) — `lib/utils/googleDrive.ts`
- **createGoogleDriveAuthorizationUrl()** (4 connections) — `lib/utils/googleDrive.ts`
- **exchangeGoogleDriveAuthorizationCode()** (4 connections) — `lib/utils/googleDrive.ts`
- **loadGlobalDriveOAuthRefreshToken()** (3 connections) — `lib/utils/googleDrive.ts`
- **renameFolderIfNeeded()** (3 connections) — `lib/utils/googleDrive.ts`
- **buildCompanyDriveFolderName()** (3 connections) — `lib/utils/googleDrive.ts`
- **redirectToSettings()** (2 connections) — `app/api/settings/google-drive/oauth/callback/route.ts`
- **canManageDrive()** (2 connections) — `app/api/settings/google-drive/oauth/start/route.ts`
- **requireClientCredentials()** (2 connections) — `lib/utils/googleDrive.ts`
- **getGoogleDriveOAuthRedirectUri()** (2 connections) — `lib/utils/googleDrive.ts`
- *... and 3 more nodes in this community*

## Relationships

- [[API Upload, Media, and Settings]] (42 shared connections)
- [[Lib Utils, Dispatch Entry Revision, and Delivery Note Number]] (11 shared connections)
- [[Lib Utils, Print, and Types]] (5 shared connections)
- [[API, Lib, and Auth]] (3 shared connections)
- [[API Materials, Settings, and Stock Exception Approvals]] (3 shared connections)
- [[Tests Integration]] (3 shared connections)
- [[API Suppliers, Transactions, and Customers]] (2 shared connections)
- [[API Reports, Materials, and Transactions]] (2 shared connections)
- [[Lib Stock, Warehouses, and Utils]] (1 shared connections)
- [[API HR, Settings, and Stock Exception Approvals]] (1 shared connections)
- [[Components Print Builder]] (1 shared connections)

## Source Files

- `app/api/settings/google-drive/oauth/callback/route.ts`
- `app/api/settings/google-drive/oauth/start/route.ts`
- `app/api/transactions/batch/route.ts`
- `lib/utils/googleDrive.ts`
- `lib/utils/googleDriveUrl.ts`

## Audit Trail

- EXTRACTED: 190 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*