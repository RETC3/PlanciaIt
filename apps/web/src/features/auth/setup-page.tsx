import { MASTER_PASSWORD_MIN_LENGTH } from '@planciait/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { sessionQueryKey, setup, setupStatusQueryKey } from './api';
import { authErrorKey } from './errors';
import { Field, FormError } from './form';
import { masterPasswordError, type MasterPasswordError } from './master-password';
import { MasterPasswordFields } from './master-password-fields';

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<MasterPasswordError | null>(null);

  const mutation = useMutation({
    mutationFn: setup,
    onSuccess: async () => {
      queryClient.setQueryData(setupStatusQueryKey, false);
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      await navigate({ to: '/mfa/enroll' });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = masterPasswordError(password, confirmPassword);
    setValidationError(error);
    if (error) return;
    mutation.mutate({ username, displayName, password });
  }

  const apiError = mutation.isError
    ? t(`auth.errors.${authErrorKey(mutation.error, 'invalidCredentials')}`)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.setup.title')}</CardTitle>
        <CardDescription>{t('auth.setup.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Field
            id="username"
            label={t('auth.fields.username')}
            autoComplete="username"
            required
            minLength={3}
            maxLength={64}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Field
            id="displayName"
            label={t('auth.fields.displayName')}
            autoComplete="name"
            required
            maxLength={100}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <MasterPasswordFields
            password={password}
            confirmation={confirmPassword}
            onPasswordChange={setPassword}
            onConfirmationChange={setConfirmPassword}
          />
          <FormError
            message={
              validationError
                ? t(`auth.masterPassword.${validationError}`, { min: MASTER_PASSWORD_MIN_LENGTH })
                : apiError
            }
          />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('auth.working') : t('auth.setup.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
