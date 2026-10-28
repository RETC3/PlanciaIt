import { MASTER_PASSWORD_MIN_LENGTH } from '@planciait/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { acceptInvitation, inspectInvitation, sessionQueryKey } from './api';
import { authErrorKey } from './errors';
import { FormError } from './form';
import { masterPasswordError, type MasterPasswordError } from './master-password';
import { MasterPasswordFields } from './master-password-fields';

/**
 * The token travels in the URL fragment (`/invite#<token>`), which browsers
 * never send to the server, so it does not end up in logs or Referer headers.
 * It is removed from the address bar as soon as it has been read.
 */
function takeTokenFromHash(): string {
  const token = window.location.hash.slice(1);
  if (token) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  return token;
}

function isInvalidInvitation(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 400);
}

export function InvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [token] = useState(takeTokenFromHash);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validationError, setValidationError] = useState<MasterPasswordError | null>(null);

  const invitation = useQuery({
    queryKey: ['auth', 'invitation', token],
    queryFn: () => inspectInvitation(token),
    enabled: token !== '',
    retry: false,
    staleTime: Infinity,
  });

  const accept = useMutation({
    mutationFn: () => acceptInvitation(token, password),
    onSuccess: async () => {
      setPassword('');
      setConfirmation('');
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      await navigate({ to: '/mfa/enroll' });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = masterPasswordError(password, confirmation);
    setValidationError(error);
    if (!error) accept.mutate();
  }

  const invalid = token === '' || (invitation.isError && isInvalidInvitation(invitation.error));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.invite.title')}</CardTitle>
        {invitation.data ? (
          <CardDescription>
            {t('auth.invite.description', {
              displayName: invitation.data.displayName,
              username: invitation.data.username,
            })}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {invalid ? (
          <FormError message={t('auth.invite.invalid')} />
        ) : invitation.isError ? (
          <FormError
            message={t(`auth.errors.${authErrorKey(invitation.error, 'invalidCredentials')}`)}
          />
        ) : invitation.isPending ? (
          <p className="text-sm text-muted-foreground">{t('auth.working')}</p>
        ) : (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <MasterPasswordFields
              password={password}
              confirmation={confirmation}
              onPasswordChange={setPassword}
              onConfirmationChange={setConfirmation}
            />
            <FormError
              message={
                validationError
                  ? t(`auth.masterPassword.${validationError}`, { min: MASTER_PASSWORD_MIN_LENGTH })
                  : accept.isError
                    ? isInvalidInvitation(accept.error)
                      ? t('auth.invite.invalid')
                      : t(`auth.errors.${authErrorKey(accept.error, 'invalidCredentials')}`)
                    : null
              }
            />
            <Button type="submit" disabled={accept.isPending}>
              {accept.isPending ? t('auth.working') : t('auth.invite.submit')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
