import {
  extraFileBaseName,
  extraFileExtension,
  extraFileStorageName,
  isAllowedExtraFile,
} from '@/lib/hr/employeeExtraFiles';

describe('employeeExtraFiles', () => {
  it('keeps the original file name and reads the extension', () => {
    expect(extraFileBaseName('C:\\docs\\Offer Letter.PDF')).toBe('Offer Letter.PDF');
    expect(extraFileExtension('Offer Letter.PDF')).toBe('pdf');
    expect(extraFileExtension('notes')).toBe('');
  });

  it('allows office files and rejects scripts', () => {
    expect(isAllowedExtraFile('scan.pdf')).toBe(true);
    expect(isAllowedExtraFile('photo.JPEG')).toBe(true);
    expect(isAllowedExtraFile('sheet.xlsx')).toBe(true);
    expect(isAllowedExtraFile('run.exe')).toBe(false);
    expect(isAllowedExtraFile('script.js')).toBe(false);
  });

  it('builds a storage name that stays unique for the same file name', () => {
    expect(extraFileStorageName('scan.pdf', 'abc123')).toBe('scan-abc123.pdf');
    expect(extraFileStorageName('My Scan.pdf', 'abc123')).not.toBe(extraFileStorageName('My Scan.pdf', 'def456'));
  });
});
