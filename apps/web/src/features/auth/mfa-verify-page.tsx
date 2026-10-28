import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { sessionQueryKey, verifyMfa } from './api';
import { authErrorKey } from './errors';
import { Field, FormError } from './form';

export function MfaVerifyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [value, setValue] = useState('');

  const mutation = useMutation({
    mutationFn: () => verifyMfa(useBackupCode ? { backupCode: value } : { code: value }),
    onSuccess: async (result) => {
      queryClient.setQueryData(sessionQueryKey, { stage: 'authenticated', user: result.user });
      await navigate({ to: '/' });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  function toggleMethod() {
    setUseBackupCode((current) => !current);
    setValue('');
    mutation.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.mfaVerify.title')}</CardTitle>
        <CardDescription>
          {useBackupCode ? t('auth.mfaVerify.backupDescription') : t('auth.mfaVerify.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {useBackupCode ? (
            <Field
              id="backupCode"
              label={t('auth.fields.backupCode')}
              autoComplete="off"
              required
              maxLength={20}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          ) : (
            <Field
              id="code"
              label={t('auth.fields.code')}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={value}
              onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))}
            />
          )}
          <FormError
            message={
              mutation.isError
                ? t(`auth.errors.${authErrorKey(mutation.error, 'invalidCode')}`)
                : null
            }
          />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('auth.working') : t('auth.mfaVerify.submit')}
          </Button>
          <Button variant="link" size="sm" onClick={toggleMethod}>
            {useBackupCode
              ? t('auth.mfaVerify.useAuthenticator')
              : t('auth.mfaVerify.useBackupCode')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
