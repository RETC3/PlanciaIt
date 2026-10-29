import type { AreaSummary, AssetType } from '@planciait/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssetForm } from './asset-form';

const area: AreaSummary = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Server',
  description: null,
  permission: 'write',
  createdAt: new Date().toISOString(),
};

const type: AssetType = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Server',
  description: null,
  assetCount: 0,
  fields: [
    { key: 'os', label: 'Sistema operativo', kind: 'text', required: true },
    { key: 'cores', label: 'Core', kind: 'number', required: false },
    { key: 'virtual', label: 'Virtuale', kind: 'boolean', required: false },
  ],
};

function renderForm() {
  const onSubmit = vi.fn();
  render(
    <AssetForm areas={[area]} types={[type]} error={null} onSubmit={onSubmit}>
      <button type="submit">Invia</button>
    </AssetForm>,
  );
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'srv-01' } });
  return onSubmit;
}

describe('AssetForm', () => {
  it('blocks submission while a required custom field is empty', () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Invia' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Sistema operativo');
  });

  it('submits common and custom fields in the API shape', () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText('Sistema operativo *'), {
      target: { value: 'Debian 13' },
    });
    fireEvent.change(screen.getByLabelText('Core'), { target: { value: '8' } });
    fireEvent.click(screen.getByLabelText('Virtuale'));
    fireEvent.change(screen.getByLabelText('Indirizzo IP'), { target: { value: '10.0.0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invia' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        areaId: area.id,
        typeId: type.id,
        name: 'srv-01',
        status: 'in_use',
        ipAddress: '10.0.0.5',
        customFields: { os: 'Debian 13', cores: 8, virtual: true },
      }),
    );
  });
});
