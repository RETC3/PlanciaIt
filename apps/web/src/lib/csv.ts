export interface CsvTable {
  headers: string[];
  /** Data rows, each padded or cut to the number of headers. */
  rows: string[][];
}

const DELIMITERS = [';', ',', '\t'] as const;

/**
 * Picks the delimiter that splits the header line into the most columns.
 * Italian Excel exports use ";", most other tools ",".
 */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let best: string = DELIMITERS[0];
  let bestCount = -1;
  for (const delimiter of DELIMITERS) {
    const count = firstLine.split(delimiter).length;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parses RFC 4180 CSV: quoted fields may contain the delimiter, line breaks
 * and doubled quotes. A leading byte-order mark is ignored; lines that are
 * completely empty are skipped.
 */
export function parseCsv(input: string): CsvTable {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  function endField() {
    record.push(field);
    field = '';
  }
  function endRecord() {
    endField();
    if (record.some((value) => value.trim() !== '')) records.push(record);
    record = [];
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRecord();
    } else {
      field += char;
    }
  }
  if (field !== '' || record.length > 0) endRecord();

  const [headerRecord, ...dataRecords] = records;
  const headers = (headerRecord ?? []).map((header) => header.trim());
  return {
    headers,
    rows: dataRecords.map((row) => headers.map((_, index) => row[index] ?? '')),
  };
}
