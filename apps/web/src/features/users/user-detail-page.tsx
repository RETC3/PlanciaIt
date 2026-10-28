import type { InvitationResponse, UserRole, UserSummary } from '@planciait/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { fetchSession, sessionQueryKey } from '@/features/auth/api';
import { Field, FormError } from '@/features/auth/form';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  getUser,
  reissueInvitation,
  resetMfa,
  updateUser,
  userQueryKey,
  usersQueryKey,
} from './api';
import { InvitationLinkCard } from './invitation-link-card';
import { UserStatusBadge } from './user-badges';

function useUserCacheUpdate() {
  const queryClient = useQueryClient();
  return async (user: UserSummary) => {
    queryClient.setQueryData(userQueryKey(user.id), user);
    await queryClient.invalidateQueries({ queryKey: usersQueryKey, exact: true });
  };
}

function errorMessage(error: unknown, t: ReturnType<typeof useTranslation>['t']): string {
  if (error instanceof ApiError && error.status === 400) return t('users.errors.notAllowed');
  return t('auth.errors.generic');
}

function EditUserForm({ user, isSelf }: { user: UserSummary; isSelf: boolean }) {
  const { t } = useTranslation();
  const updateCache = useUserCacheUpdate();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState<UserRole>(user.role);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () => updateUser(user.id, { displayName, role }),
    onSuccess: async (updated) => {
      setSaved(true);
      await updateCache(updated);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    mutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('users.detail.profile')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:max-w-md" onSubmit={handleSubmit}>
          <Field
            id="displayName"
            label={t('auth.fields.displayName')}
            required
            maxLength={100}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <div className="grid gap-2">
            <Label htmlFor="role">{t('users.fields.role')}</Label>
            <NativeSelect
              id="role"
              value={role}
              disabled={isSelf}
              onChange={(event) => setRole(event.target.value as UserRole)}
            >
              <option value="technician">{t('users.roles.technician')}</option>
              <option value="admin">{t('users.roles.admin')}</option>
            </NativeSelect>
            {isSelf ? (
              <p className="text-xs text-muted-foreground">{t('users.detail.selfRoleHint')}</p>
            ) : null}
          </div>
          <FormError message={mutation.isError ? errorMessage(mutation.error, t) : null} />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={mutation.isPending}>
              {t('common.save')}
            </Button>
            {saved ? (
              <span className="text-sm text-muted-foreground">{t('common.saved')}</span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AccessActions({
  user,
  onInvitation,
}: {
  user: UserSummary;
  onInvitation: (invitation: InvitationResponse) => void;
}) {
  const { t } = useTranslation();
  const updateCache = useUserCacheUpdate();
  const active = user.status !== 'disabled';

  const toggleActive = useMutation({
    mutationFn: () => updateUser(user.id, { isActive: !active }),
    onSuccess: updateCache,
  });
  const mfaReset = useMutation({
    mutationFn: () => resetMfa(user.id),
    onSuccess: updateCache,
  });
  const invitation = useMutation({
    mutationFn: () => reissueInvitation(user.id),
    onSuccess: async (result) => {
      await updateCache(result.user);
      onInvitation(result);
    },
  });

  function confirmThen(message: string, action: () => void) {
    if (window.confirm(message)) action();
  }

  const failed = [toggleActive, mfaReset, invitation].find((mutation) => mutation.isError);
  const hasPassword = user.status === 'active' || user.status === 'mfa_pending';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('users.detail.access')}</CardTitle>
        <CardDescription>{t('users.detail.accessDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={toggleActive.isPending}
            onClick={() =>
              confirmThen(
                active ? t('users.confirm.deactivate') : t('users.confirm.reactivate'),
                () => toggleActive.mutate(),
              )
            }
          >
            {active ? t('users.actions.deactivate') : t('users.actions.reactivate')}
          </Button>
          {user.status === 'active' ? (
            <Button
              variant="outline"
              disabled={mfaReset.isPending}
              onClick={() => confirmThen(t('users.confirm.resetMfa'), () => mfaReset.mutate())}
            >
              {t('users.actions.resetMfa')}
            </Button>
          ) : null}
          {active ? (
            <Button
              variant="outline"
              disabled={invitation.isPending}
              onClick={() =>
                hasPassword
                  ? confirmThen(t('users.confirm.resetAccess'), () => invitation.mutate())
                  : invitation.mutate()
              }
            >
              {hasPassword ? t('users.actions.resetAccess') : t('users.actions.newInvitation')}
            </Button>
          ) : null}
        </div>
        <FormError message={failed ? errorMessage(failed.error, t) : null} />
      </CardContent>
    </Card>
  );
}

export function UserDetailPage({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const user = useQuery({ queryKey: userQueryKey(userId), queryFn: () => getUser(userId) });
  const session = useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession });
  const [invitation, setInvitation] = useState<InvitationResponse | null>(null);
  const isSelf = session.data?.user.id === userId;

  return (
    <div className="grid max-w-3xl gap-6">
      <Link
        to="/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('users.title')}
      </Link>

      {user.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : user.isError ? (
        <FormError
          message={
            user.error instanceof ApiError && user.error.status === 404
              ? t('users.errors.notFound')
              : t('auth.errors.generic')
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">{user.data.displayName}</h1>
            <UserStatusBadge status={user.data.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{user.data.username}</span>
            {' · '}
            {t('users.detail.createdAt', {
              date: formatDateTime(user.data.createdAt, i18n.language),
            })}
          </p>

          {invitation ? (
            <InvitationLinkCard invitation={invitation} onDone={() => setInvitation(null)} />
          ) : null}

          <EditUserForm key={user.data.id} user={user.data} isSelf={isSelf} />

          {isSelf ? (
            <p className="text-sm text-muted-foreground">{t('users.detail.selfAccessHint')}</p>
          ) : (
            <AccessActions user={user.data} onInvitation={setInvitation} />
          )}
        </>
      )}
    </div>
  );
}
