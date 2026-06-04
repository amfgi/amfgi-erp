import {
  convertLineQuantity,
  convertLineUnitCost,
  defaultDisplayUnitCost,
  getMaterialUomFactor,
} from '@/lib/stock/uomLineDisplay';
import type { Material } from '@/store/hooks';

const material = {
  id: 'mat-1',
  unit: 'kg',
  unitCost: 2,
  materialUoms: [
    { id: 'uom-base', unitName: 'kg', isBase: true, factorToBase: 1 },
    { id: 'uom-drum', unitName: 'drum', isBase: false, factorToBase: 190 },
  ],
} as Material;

describe('uomLineDisplay', () => {
  it('scales default display cost by UOM factor', () => {
    expect(defaultDisplayUnitCost(material, '')).toBe('2');
    expect(defaultDisplayUnitCost(material, 'uom-drum')).toBe('380');
  });

  it('preserves base cost when switching UOM', () => {
    expect(getMaterialUomFactor(material, 'uom-drum')).toBe(190);
    expect(convertLineUnitCost('380', material, 'uom-drum', '')).toBe('2');
    expect(convertLineUnitCost('2', material, '', 'uom-drum')).toBe('380');
  });

  it('converts quantity across UOMs', () => {
    expect(convertLineQuantity('190', material, '', 'uom-drum')).toBe('1');
    expect(convertLineQuantity('1', material, 'uom-drum', '')).toBe('190');
  });
});
