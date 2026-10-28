import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { login, sessionQueryKey } from './api';
import { authErrorKey } from './errors';
import { Field, FormError } from './form';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => login(username.trim().toLowerCase(), password),
    onSuccess: async ({ stage }) => {
      setPassword('');
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      await navigate({ to: stage === 'mfa_enrollment' ? '/mfa/enroll' : '/mfa/verify' });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.login.title')}</CardTitle>
        <CardDescription>{t('auth.login.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Field
            id="username"
            label={t('auth.fields.username')}
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Field
            id="password"
            type="password"
            label={t('auth.fields.password')}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <FormError
            message={
              mutation.isError
                ? t(`auth.errors.${authErrorKey(mutation.error, 'invalidCredentials')}`)
                : null
            }
          />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('auth.working') : t('auth.login.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
