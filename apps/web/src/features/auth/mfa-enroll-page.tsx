import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  confirmMfaEnrollment,
  mfaEnrollmentQueryKey,
  sessionQueryKey,
  startMfaEnrollment,
} from './api';
import { authErrorKey } from './errors';
import { Field, FormError } from './form';

/** Groups the base32 secret in blocks of four for easier manual entry. */
function formatSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

export function MfaEnrollPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  // A query (not an effect) so StrictMode's double mount reuses one request
  // instead of generating two different secrets.
  const enrollment = useQuery({
    queryKey: mfaEnrollmentQueryKey,
    queryFn: startMfaEnrollment,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const confirm = useMutation({
    mutationFn: () => confirmMfaEnrollment(code),
    onSuccess: (result) => {
      setCode('');
      setBackupCodes(result.backupCodes);
      queryClient.setQueryData(sessionQueryKey, { stage: 'authenticated', user: result.user });
      queryClient.removeQueries({ queryKey: mfaEnrollmentQueryKey });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    confirm.mutate();
  }

  async function copyCodes(codes: string[]) {
    await navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
  }

  if (backupCodes) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.mfaEnroll.backupTitle')}</CardTitle>
          <CardDescription>{t('auth.mfaEnroll.backupDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid grid-cols-2 gap-2 rounded-md border bg-secondary p-4 font-mono text-sm">
            {backupCodes.map((backupCode) => (
              <li key={backupCode}>{backupCode}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copyCodes(backupCodes)}>
              {copied ? t('auth.mfaEnroll.copied') : t('auth.mfaEnroll.copy')}
            </Button>
            <Button onClick={() => void navigate({ to: '/' })}>
              {t('auth.mfaEnroll.backupConfirm')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.mfaEnroll.title')}</CardTitle>
        <CardDescription>{t('auth.mfaEnroll.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {enrollment.isPending ? (
          <p className="text-sm text-muted-foreground">{t('auth.mfaEnroll.loading')}</p>
        ) : enrollment.isError ? (
          <FormError
            message={t(`auth.errors.${authErrorKey(enrollment.error, 'sessionExpired')}`)}
          />
        ) : (
          <>
            <p className="text-sm">{t('auth.mfaEnroll.step1')}</p>
            <p className="rounded-md border bg-secondary p-3 text-center font-mono text-sm break-all select-all">
              {formatSecret(enrollment.data.secret)}
            </p>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{t('auth.mfaEnroll.uriLabel')}</summary>
              <p className="mt-2 font-mono break-all select-all">{enrollment.data.otpauthUri}</p>
            </details>
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <p className="text-sm">{t('auth.mfaEnroll.step2')}</p>
              <Field
                id="code"
                label={t('auth.fields.code')}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
              <FormError
                message={
                  confirm.isError
                    ? t(`auth.errors.${authErrorKey(confirm.error, 'invalidCode')}`)
                    : null
                }
              />
              <Button type="submit" disabled={confirm.isPending}>
                {confirm.isPending ? t('auth.working') : t('auth.mfaEnroll.submit')}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
