import { scoreSearchLabel, searchItems } from '@/lib/utils/fuzzyMatch';

describe('scoreSearchLabel', () => {
  it('ranks exact label matches highest', () => {
    expect(scoreSearchLabel('Putty', 'putty')).toBeGreaterThan(scoreSearchLabel('Bond Putty', 'putty'));
  });

  it('ranks prefix matches above embedded substring matches', () => {
    expect(scoreSearchLabel('Putty Filler', 'putty')).toBeGreaterThan(scoreSearchLabel('Bond Putty', 'putty'));
  });
});

describe('searchItems', () => {
  const items = [
    { id: '1', label: 'Bond Putty', searchText: '120 kg' },
    { id: '2', label: 'Putty', searchText: '80 kg' },
    { id: '3', label: 'Wall Putty Premium', searchText: '40 kg' },
  ];

  it('orders exact and shorter label matches before longer substring matches', () => {
    const results = searchItems(items, 'putty', 0.2);
    expect(results.map((item) => item.label)).toEqual(['Putty', 'Bond Putty', 'Wall Putty Premium']);
  });
});
