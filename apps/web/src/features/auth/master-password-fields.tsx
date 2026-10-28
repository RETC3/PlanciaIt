import { MASTER_PASSWORD_MIN_LENGTH } from '@planciait/shared';
import { useTranslation } from 'react-i18next';
import { Field } from './form';

interface MasterPasswordFieldsProps {
  password: string;
  confirmation: string;
  onPasswordChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
}

/** "New master password" and its confirmation, used at setup and when accepting an invitation. */
export function MasterPasswordFields({
  password,
  confirmation,
  onPasswordChange,
  onConfirmationChange,
}: MasterPasswordFieldsProps) {
  const { t } = useTranslation();
  return (
    <>
      <Field
        id="password"
        type="password"
        label={t('auth.fields.password')}
        autoComplete="new-password"
        required
        hint={t('auth.masterPassword.hint', { min: MASTER_PASSWORD_MIN_LENGTH })}
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
      />
      <Field
        id="confirmPassword"
        type="password"
        label={t('auth.fields.confirmPassword')}
        autoComplete="new-password"
        required
        value={confirmation}
        onChange={(event) => onConfirmationChange(event.target.value)}
      />
    </>
  );
}
