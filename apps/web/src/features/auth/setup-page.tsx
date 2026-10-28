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

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

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
    if (password.length < MASTER_PASSWORD_MIN_LENGTH) {
      setValidationError(t('auth.setup.passwordTooShort', { min: MASTER_PASSWORD_MIN_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      setValidationError(t('auth.setup.passwordMismatch'));
      return;
    }
    setValidationError(null);
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
          <Field
            id="password"
            type="password"
            label={t('auth.fields.password')}
            autoComplete="new-password"
            required
            hint={t('auth.setup.passwordHint', { min: MASTER_PASSWORD_MIN_LENGTH })}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Field
            id="confirmPassword"
            type="password"
            label={t('auth.fields.confirmPassword')}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <FormError message={validationError ?? apiError} />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('auth.working') : t('auth.setup.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
