import {
  isHrOnlyRecipient,
  selectDueVisaNotices,
  visaDocumentNumber,
  type VisaForNotice,
} from '@/lib/hr/visaExpiryNotice';

const today = '2026-11-16';

function visa(overrides: Partial<VisaForNotice> = {}): VisaForNotice {
  return {
    id: 'visa-1',
    companyId: 'company-1',
    employeeId: 'employee-1',
    employeeName: 'Rehan Iqbal',
    employeeCode: 'AMFGI-0008',
    label: 'Company visa',
    endDate: '2027-01-15',
    visaNumber: 'EMP026',
    ...overrides,
  };
}

describe('visa expiry notices', () => {
  it('includes a current visa on the 60th day and not the day before', () => {
    const onTheDay = selectDueVisaNotices({
      today,
      visas: [visa({ endDate: '2027-01-15' })],
      sent: [],
      recipientIds: ['hr-1'],
    });
    const tooEarly = selectDueVisaNotices({
      today,
      visas: [visa({ endDate: '2027-01-16' })],
      sent: [],
      recipientIds: ['hr-1'],
    });
    expect(onTheDay.map((row) => row.stage)).toEqual(['60']);
    expect(tooEarly).toEqual([]);
  });

  it('includes a visa that expires today and skips one that already expired', () => {
    const due = selectDueVisaNotices({
      today,
      visas: [visa({ endDate: today }), visa({ id: 'old', endDate: '2026-11-15' })],
      sent: [],
      recipientIds: ['hr-1'],
    });
    expect(due.map((row) => row.visa.id)).toEqual(['visa-1']);
  });

  it('skips an exited employee', () => {
    const due = selectDueVisaNotices({
      today,
      visas: [visa({ endDate: '2026-12-01', employeeStatus: 'EXITED' })],
      sent: [],
      recipientIds: ['hr-1'],
    });
    expect(due).toEqual([]);
  });

  it('warns about the later active visa and not the one it replaced', () => {
    const due = selectDueVisaNotices({
      today,
      visas: [
        visa({ id: 'old', endDate: '2026-12-01' }),
        visa({ id: 'renewed', endDate: '2028-01-01' }),
      ],
      sent: [],
      recipientIds: ['hr-1'],
    });
    expect(due).toEqual([]);
  });

  it('keeps two visas that end on the same day', () => {
    const due = selectDueVisaNotices({
      today,
      visas: [
        visa({ id: 'a', endDate: '2026-12-01' }),
        visa({ id: 'b', employeeId: 'employee-1', endDate: '2026-12-01' }),
      ],
      sent: [],
      recipientIds: ['hr-1'],
    });
    expect(due.map((row) => row.visa.id).sort()).toEqual(['a', 'b']);
  });

  it('does not repeat a 60-day notice that was already sent', () => {
    const due = selectDueVisaNotices({
      today,
      visas: [visa({ endDate: '2027-01-10' })],
      sent: [{ visaId: 'visa-1', recipientId: 'hr-1', stage: '60', sentOn: '2026-11-01' }],
      recipientIds: ['hr-1'],
    });
    expect(due).toEqual([]);
  });

  it('sends the 60-day notice first when the visa is already inside 30 days', () => {
    const due = selectDueVisaNotices({
      today,
      visas: [visa({ endDate: '2026-12-01' })],
      sent: [],
      recipientIds: ['hr-1'],
    });
    expect(due.map((row) => row.stage)).toEqual(['60']);
  });

  it('sends the 30-day follow-up on a later day and not on the same day as the first notice', () => {
    const sameDay = selectDueVisaNotices({
      today,
      visas: [visa({ endDate: '2026-12-01' })],
      sent: [{ visaId: 'visa-1', recipientId: 'hr-1', stage: '60', sentOn: today }],
      recipientIds: ['hr-1'],
    });
    const later = selectDueVisaNotices({
      today,
      visas: [visa({ endDate: '2026-12-01' })],
      sent: [{ visaId: 'visa-1', recipientId: 'hr-1', stage: '60', sentOn: '2026-11-01' }],
      recipientIds: ['hr-1'],
    });
    expect(sameDay).toEqual([]);
    expect(later.map((row) => row.stage)).toEqual(['30']);
  });

  it('still notifies an HR user who has not received the visa', () => {
    const due = selectDueVisaNotices({
      today,
      visas: [visa({ endDate: '2026-12-20' })],
      sent: [{ visaId: 'visa-1', recipientId: 'hr-1', stage: '60', sentOn: '2026-11-01' }],
      recipientIds: ['hr-1', 'hr-2'],
    });
    expect(due.map((row) => row.recipientId)).toEqual(['hr-2']);
  });

  it('accepts only an active user whose single role is HR', () => {
    expect(isHrOnlyRecipient({ isSuperAdmin: false, isActive: true, email: 'hr@amfgi.com', roleSlugs: ['hr'] })).toBe(true);
    expect(isHrOnlyRecipient({ isSuperAdmin: true, isActive: true, email: 'admin@amfgi.com', roleSlugs: ['hr'] })).toBe(false);
    expect(isHrOnlyRecipient({ isSuperAdmin: false, isActive: true, email: 'hr@amfgi.com', roleSlugs: ['hr', 'manager'] })).toBe(false);
    expect(isHrOnlyRecipient({ isSuperAdmin: false, isActive: true, email: '  ', roleSlugs: ['hr'] })).toBe(false);
  });

  it('uses the visa document number and ignores other linked files', () => {
    expect(visaDocumentNumber([
      { documentNumber: 'P026', requiresVisaPeriod: false, sortOrder: 0 },
      { documentNumber: 'EMP026', requiresVisaPeriod: true, sortOrder: 2 },
    ])).toBe('EMP026');
    expect(visaDocumentNumber([{ documentNumber: null, requiresVisaPeriod: true, sortOrder: 0 }])).toBeNull();
  });
});
