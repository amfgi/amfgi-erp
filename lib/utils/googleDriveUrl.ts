const GOOGLE_DRIVE_VIEWER_BASE = 'https://lh3.googleusercontent.com/u/0/d/';
const GOOGLE_DRIVE_OPEN_BASE = 'https://drive.google.com/file/d/';
const BARE_DRIVE_FILE_ID = /^[a-zA-Z0-9_-]{10,}$/;

/**
 * Googleusercontent preview URL for a Drive file id.
 * Good for images / first-page PDF thumbnails in `<img>` tags.
 * Not suitable for opening multi-page documents — use {@link driveFileIdToOpenUrl}.
 */
export function driveFileIdToDisplayUrl(driveId: string | null | undefined): string | null {
  const id = driveId?.trim();
  if (!id) return null;
  return `${GOOGLE_DRIVE_VIEWER_BASE}${encodeURIComponent(id)}`;
}

/**
 * Native Google Drive viewer/download page for a file id (full multi-page PDFs, etc.).
 */
export function driveFileIdToOpenUrl(driveId: string | null | undefined): string | null {
  const id = driveId?.trim();
  if (!id) return null;
  return `${GOOGLE_DRIVE_OPEN_BASE}${encodeURIComponent(id)}/view`;
}

/**
 * Resolve a stored Drive media URL (page link, googleusercontent, or bare id)
 * to a Drive open/view URL suitable for "Open file" links.
 */
export function driveStoredUrlToOpenUrl(url: string | null | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;
  if (BARE_DRIVE_FILE_ID.test(value)) {
    return driveFileIdToOpenUrl(value);
  }
  const fileId = extractGoogleDriveFileId(value);
  return fileId ? driveFileIdToOpenUrl(fileId) : value;
}

/**
 * Value from a bound template field: full URL, Drive page URL, or bare Drive file id.
 */
export function resolveBoundFieldImageSrc(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return convertGoogleDriveUrl(value);
  }
  if (BARE_DRIVE_FILE_ID.test(value)) {
    return driveFileIdToDisplayUrl(value) ?? '';
  }
  return convertGoogleDriveUrl(value);
}

export function convertGoogleDriveUrl(url: string): string {
  if (!url) return '';

  if (url.includes('googleusercontent.com')) {
    return url;
  }

  const fileId = extractGoogleDriveFileId(url);
  if (fileId) {
    return driveFileIdToDisplayUrl(fileId) ?? url;
  }

  return url;
}

/**
 * Extract file ID from various Google Drive URL formats.
 */
export function extractGoogleDriveFileId(url: string): string | null {
  if (!url) return null;

  const patterns = [
    /\/d\/([a-zA-Z0-9-_]+)/,
    /\/u\/\d+\/d\/([a-zA-Z0-9-_]+)/,
    /id=([a-zA-Z0-9-_]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}
