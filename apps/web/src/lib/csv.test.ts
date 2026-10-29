import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('reads a semicolon-separated Excel export with a BOM and CRLF', () => {
    expect(parseCsv('﻿Nome;IP\r\nsrv-01;10.0.0.1\r\nsrv-02;10.0.0.2\r\n')).toEqual({
      headers: ['Nome', 'IP'],
      rows: [
        ['srv-01', '10.0.0.1'],
        ['srv-02', '10.0.0.2'],
      ],
    });
  });

  it('handles quotes, embedded delimiters, doubled quotes and line breaks', () => {
    const csv = 'name,notes\n"srv, primario","dice ""ciao""\nseconda riga"\n';
    expect(parseCsv(csv).rows).toEqual([['srv, primario', 'dice "ciao"\nseconda riga']]);
  });

  it('detects tabs, skips blank lines and pads short rows', () => {
    expect(parseCsv('a\tb\tc\n\n1\t2\n')).toEqual({
      headers: ['a', 'b', 'c'],
      rows: [['1', '2', '']],
    });
  });

  it('copes with an empty file and a missing final newline', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
    expect(parseCsv('a,b\n1,2').rows).toEqual([['1', '2']]);
  });
});
