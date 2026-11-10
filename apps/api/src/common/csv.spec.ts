import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { csvCell, harareDateRange, harareTime, toCsv, usd } from './csv';

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Mbare, Harare')).toBe('"Mbare, Harare"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('neutralises spreadsheet formulas in text', () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe(
      '"\'=HYPERLINK(""http://x"",""click"")"',
    );
    expect(csvCell('+263771234567')).toBe("'+263771234567");
    expect(csvCell('-1+1')).toBe("'-1+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('leaves numbers, empty values and ordinary text alone', () => {
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(csvCell(null)).toBe('');
    expect(csvCell('Tariro Moyo')).toBe('Tariro Moyo');
  });
});

describe('toCsv', () => {
  it('starts with a BOM and uses CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('\uFEFFa,b\r\n1,x\r\n');
  });
});

describe('usd', () => {
  it('converts cents to dollars', () => {
    expect(usd(1999)).toBe(19.99);
    expect(usd(0)).toBe(0);
  });
});

describe('harareDateRange', () => {
  it('covers whole Harare days, inclusive of both ends', () => {
    const { start, end } = harareDateRange('2026-10-01', '2026-10-31');
    expect(start.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T22:00:00.000Z');
  });

  it('rejects bad input', () => {
    for (const [from, to] of [
      [undefined, '2026-10-01'],
      ['2026-10-01', 'yesterday'],
      ['2026-02-30', '2026-03-01'],
      ['2026-10-05', '2026-10-01'],
      ['2025-01-01', '2026-10-01'],
    ] as const) {
      expect(() => harareDateRange(from, to)).toThrow(BadRequestException);
    }
  });
});

describe('harareTime', () => {
  it('shows UTC instants in Harare time', () => {
    expect(harareTime(new Date('2026-10-01T22:30:00Z'))).toBe('2026-10-02 00:30');
  });
});
