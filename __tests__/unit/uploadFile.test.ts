import { assertUploadFile, uploadMimeType } from '@/lib/sales/service';
import { driveStoredUrlToOpenUrl } from '@/lib/utils/googleDriveUrl';

describe('quotation document uploads', () => {
  it('keeps a known mime type and fills one in from the file name', () => {
    const pdf = new File([new Uint8Array([1])], 'layout.pdf', { type: 'application/pdf' });
    expect(uploadMimeType(pdf)).toBe('application/pdf');
    expect(assertUploadFile(pdf)).toBe('application/pdf');

    const word = new File([new Uint8Array([1])], 'layout.docx', { type: '' });
    expect(assertUploadFile(word)).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const drawing = new File([new Uint8Array([1])], 'tank-layout.dwg', { type: '' });
    expect(assertUploadFile(drawing)).toBe('application/acad');
  });

  it('rejects an empty file and a file that is not a document', () => {
    expect(() => assertUploadFile(new File([], 'empty.pdf', { type: 'application/pdf' }))).toThrow('The file is empty');
    expect(() => assertUploadFile(new File([new Uint8Array([1])], 'notes.txt', { type: 'text/plain' }))).toThrow(
      'Upload a PDF, image, Word, Excel, or drawing file',
    );
  });

  it('opens the Drive file page from a stored thumbnail link', () => {
    expect(driveStoredUrlToOpenUrl('https://lh3.googleusercontent.com/u/0/d/abc_def-1234567890')).toBe(
      'https://drive.google.com/file/d/abc_def-1234567890/view',
    );
  });
});
