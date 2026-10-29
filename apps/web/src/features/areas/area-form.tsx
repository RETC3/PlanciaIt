import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Field, FormError } from '@/features/auth/form';
import { areaErrorMessage } from './errors';

export interface AreaFormValues {
  name: string;
  description: string;
}

/** Name and description, shared by the create and edit forms. */
export function AreaForm({
  initial,
  error,
  onSubmit,
  children,
}: {
  initial: AreaFormValues;
  error: unknown;
  onSubmit: (values: AreaFormValues) => void;
  /** The submit and cancel buttons. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ name, description });
  }

  return (
    <form className="grid gap-4 sm:max-w-md" onSubmit={handleSubmit}>
      <Field
        id="areaName"
        label={t('areas.fields.name')}
        autoComplete="off"
        required
        maxLength={100}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="grid gap-2">
        <Label htmlFor="areaDescription">{t('areas.fields.description')}</Label>
        <Textarea
          id="areaDescription"
          name="areaDescription"
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <FormError message={error ? areaErrorMessage(error, t) : null} />
      {children}
    </form>
  );
}
