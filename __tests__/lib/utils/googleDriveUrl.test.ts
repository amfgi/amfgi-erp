import {
  driveFileIdToDisplayUrl,
  driveFileIdToOpenUrl,
  driveStoredUrlToOpenUrl,
  extractGoogleDriveFileId,
} from '@/lib/utils/googleDriveUrl';

describe('googleDriveUrl open vs preview', () => {
  const fileId = '1AbCDefGhIjKlMnOpQrStUvWxYz012345';

  it('builds a full Drive view URL for opening documents', () => {
    expect(driveFileIdToOpenUrl(fileId)).toBe(`https://drive.google.com/file/d/${fileId}/view`);
  });

  it('keeps googleusercontent display URLs for image previews', () => {
    expect(driveFileIdToDisplayUrl(fileId)).toBe(`https://lh3.googleusercontent.com/u/0/d/${fileId}`);
  });

  it('converts stored googleusercontent media URLs to Drive open URLs', () => {
    const stored = `https://lh3.googleusercontent.com/u/0/d/${fileId}`;
    expect(driveStoredUrlToOpenUrl(stored)).toBe(`https://drive.google.com/file/d/${fileId}/view`);
  });

  it('extracts ids from Drive view links and opens them', () => {
    const view = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    expect(extractGoogleDriveFileId(view)).toBe(fileId);
    expect(driveStoredUrlToOpenUrl(view)).toBe(`https://drive.google.com/file/d/${fileId}/view`);
  });
});
