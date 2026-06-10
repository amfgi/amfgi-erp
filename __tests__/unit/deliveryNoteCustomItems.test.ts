import {
  formatDeliveryNoteCustomItemBullet,
  inferCustomItemsLineNoAuto,
  parseDeliveryNoteCustomItemBullet,
  parseDeliveryNoteCustomItemsFromNotes,
  resolveCustomItemLineNoForSave,
} from '@/lib/utils/deliveryNoteCustomItems';

describe('deliveryNoteCustomItems', () => {
  it('formats items without qty or unit', () => {
    expect(
      formatDeliveryNoteCustomItemBullet({
        name: 'Cutting blade',
        description: 'For site use',
        qty: '',
        unit: '',
      })
    ).toBe('• Cutting blade - For site use |');
  });

  it('parses items without qty or unit', () => {
    expect(parseDeliveryNoteCustomItemBullet('• Cutting blade - For site use |')).toEqual({
      lineNo: '',
      name: 'Cutting blade',
      description: 'For site use',
      qty: '',
      unit: '',
    });
  });

  it('infers auto line numbering from sequential values', () => {
    expect(
      inferCustomItemsLineNoAuto([
        { lineNo: '1' },
        { lineNo: '2' },
        { lineNo: '' },
      ])
    ).toBe(true);
    expect(
      inferCustomItemsLineNoAuto([
        { lineNo: '1' },
        { lineNo: '3' },
      ])
    ).toBe(false);
  });

  it('resolves line numbers for save', () => {
    expect(resolveCustomItemLineNoForSave({ lineNo: '9' }, 0, true)).toBe('1');
    expect(resolveCustomItemLineNoForSave({ lineNo: '9' }, 0, false)).toBe('9');
    expect(resolveCustomItemLineNoForSave({ lineNo: '' }, 2, false)).toBeUndefined();
  });

  it('parses a notes block with empty qty/unit lines', () => {
    const notes = `--- DELIVERY NOTE ITEMS (For Printing) ---
• Widget A - Long description |`;
    expect(parseDeliveryNoteCustomItemsFromNotes(notes)).toEqual([
      {
        lineNo: '',
        name: 'Widget A',
        description: 'Long description',
        qty: '',
        unit: '',
      },
    ]);
  });
});
