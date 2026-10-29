import type { AssetFieldDefinition } from '@planciait/shared';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';
import { previewImport, suggestMapping, type CommonTarget } from './csv-import';

const labels: Record<CommonTarget, string> = {
  name: 'Nome',
  status: 'Stato',
  hostname: 'Hostname',
  ipAddress: 'Indirizzo IP',
  serialNumber: 'Numero di serie',
  manufacturer: 'Produttore',
  model: 'Modello',
  location: 'Posizione',
  notes: 'Note',
};

const statusLabels = {
  in_use: 'In uso',
  in_stock: 'In magazzino',
  maintenance: 'In manutenzione',
  retired: 'Dismesso',
};

const fields: AssetFieldDefinition[] = [
  { key: 'os', label: 'Sistema operativo', kind: 'text', required: true },
  { key: 'cores', label: 'Core', kind: 'number', required: false },
  { key: 'virtual', label: 'Virtuale', kind: 'boolean', required: false },
  { key: 'warranty_end', label: 'Fine garanzia', kind: 'date', required: false },
  { key: 'tier', label: 'Livello', kind: 'select', required: false, options: ['Oro', 'Argento'] },
];

describe('suggestMapping', () => {
  it('matches labels, keys and aliases, and ignores unknown or repeated columns', () => {
    expect(
      suggestMapping(
        ['Nome', 'IP', 'S/N', 'Sistema operativo', 'cores', 'Colore', 'nome'],
        fields,
        labels,
      ),
    ).toEqual(['name', 'ipAddress', 'serialNumber', 'custom:os', 'custom:cores', null, null]);
  });
});

describe('previewImport', () => {
  const csv = [
    'Nome;Stato;IP;Sistema operativo;Core;Virtuale;Fine garanzia;Livello',
    'srv-01;In magazzino;10.0.0.1;Debian;2,5;sì;31/12/2027;oro',
    'srv-02;;;Windows;;no;;',
    ';In uso;10.0.0.300;;otto;forse;domani;Bronzo',
  ].join('\n');
  const table = parseCsv(csv);
  const preview = previewImport(
    table,
    suggestMapping(table.headers, fields, labels),
    fields,
    statusLabels,
  );

  it('converts Italian-formatted values into valid rows', () => {
    expect(preview.valid.map((row) => row.line)).toEqual([2, 3]);
    expect(preview.valid[0]?.asset).toMatchObject({
      name: 'srv-01',
      status: 'in_stock',
      ipAddress: '10.0.0.1',
      customFields: {
        os: 'Debian',
        cores: 2.5,
        virtual: true,
        warranty_end: '2027-12-31',
        tier: 'Oro',
      },
    });
    expect(preview.valid[1]?.asset).toMatchObject({
      name: 'srv-02',
      status: 'in_use',
      ipAddress: null,
      customFields: { os: 'Windows', virtual: false },
    });
  });

  it('reports every faulty field of an invalid row', () => {
    expect(preview.invalid).toHaveLength(1);
    expect(preview.invalid[0]?.line).toBe(4);
    expect([...(preview.invalid[0]?.targets ?? [])].sort()).toEqual(
      [
        'custom:cores',
        'custom:os',
        'custom:tier',
        'custom:virtual',
        'custom:warranty_end',
        'ipAddress',
        'name',
      ].sort(),
    );
  });
});
