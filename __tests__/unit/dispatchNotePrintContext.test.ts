import { buildDispatchNoteTemplateData } from '@/lib/utils/templateData';

describe('buildDispatchNoteTemplateData', () => {
  const company = {
    name: 'Test Co',
    address: 'Addr',
    phone: '123',
    email: 'test@example.com',
    letterheadUrl: '',
  };

  it('builds material lines and totals from grouped STOCK_OUT transactions', () => {
    const result = buildDispatchNoteTemplateData(
      [
        {
          type: 'STOCK_OUT',
          date: '2026-06-10T00:00:00.000Z',
          notes: 'Site issue',
          quantity: 5,
          totalCost: 500,
          material: { name: 'Cable', unit: 'M', unitCost: 100 },
          warehouse: { name: 'Main Store' },
          job: {
            jobNumber: 'JOB-1',
            description: 'Install',
            customer: { name: 'Acme' },
          },
        },
        {
          type: 'STOCK_OUT',
          date: '2026-06-10T00:00:00.000Z',
          notes: 'Site issue',
          quantity: 2,
          totalCost: 200,
          material: { name: 'Tray', unit: 'PCS', unitCost: 100 },
          warehouse: { name: 'Main Store' },
          job: {
            jobNumber: 'JOB-1',
            description: 'Install',
            customer: { name: 'Acme' },
          },
        },
      ],
      company
    );

    expect(result.dispatch.quantity).toBe(7);
    expect(result.dispatch.totalCost).toBe(700);
    expect(result.dispatch.notes).toBe('Site issue');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.name).toBe('Cable');
    expect(result.items[0]?.description).toBe('Main Store');
    expect(result.customer?.name).toBe('Acme');
    expect(result.dispatch.reference).toContain('JOB-1');
  });
});
