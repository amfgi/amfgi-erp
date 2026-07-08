import { resolveLineGridAdvanceTarget } from '@/lib/stock/lineGridKeyboardNav';

describe('resolveLineGridAdvanceTarget', () => {
  const rowCount = 5;
  const colCount = 4;

  it('moves right on next', () => {
    expect(resolveLineGridAdvanceTarget(0, 0, 'next', rowCount, colCount)).toEqual({ row: 0, col: 1 });
    expect(resolveLineGridAdvanceTarget(0, 3, 'next', rowCount, colCount)).toEqual({ row: 1, col: 0 });
  });

  it('moves left on prev', () => {
    expect(resolveLineGridAdvanceTarget(1, 0, 'prev', rowCount, colCount)).toEqual({ row: 0, col: 3 });
    expect(resolveLineGridAdvanceTarget(0, 2, 'prev', rowCount, colCount)).toEqual({ row: 0, col: 1 });
  });

  it('moves down and up within bounds', () => {
    expect(resolveLineGridAdvanceTarget(1, 2, 'down', rowCount, colCount)).toEqual({ row: 2, col: 2 });
    expect(resolveLineGridAdvanceTarget(1, 2, 'up', rowCount, colCount)).toEqual({ row: 0, col: 2 });
    expect(resolveLineGridAdvanceTarget(4, 1, 'down', rowCount, colCount)).toEqual({ row: 4, col: 1 });
    expect(resolveLineGridAdvanceTarget(0, 1, 'up', rowCount, colCount)).toEqual({ row: 0, col: 1 });
  });
});
