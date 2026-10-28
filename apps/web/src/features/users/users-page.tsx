import type { InvitationResponse, UserRole } from '@planciait/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Field, FormError } from '@/features/auth/form';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { createUser, listUsers, usersQueryKey } from './api';
import { InvitationLinkCard } from './invitation-link-card';
import { UserRoleLabel, UserStatusBadge } from './user-badges';

function CreateUserForm({
  onCreated,
  onCancel,
}: {
  onCreated: (invitation: InvitationResponse) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('technician');

  const mutation = useMutation({
    mutationFn: () => createUser({ username, displayName, role }),
    onSuccess: async (invitation) => {
      await queryClient.invalidateQueries({ queryKey: usersQueryKey });
      onCreated(invitation);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  const error = mutation.isError
    ? mutation.error instanceof ApiError && mutation.error.status === 409
      ? t('users.errors.usernameTaken')
      : mutation.error instanceof ApiError && mutation.error.status === 400
        ? t('users.errors.invalidInput')
        : t('auth.errors.generic')
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('users.create.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:max-w-md" onSubmit={handleSubmit}>
          <Field
            id="username"
            label={t('auth.fields.username')}
            hint={t('users.create.usernameHint')}
            autoComplete="off"
            required
            minLength={3}
            maxLength={64}
            pattern="[A-Za-z0-9._\-]+"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Field
            id="displayName"
            label={t('auth.fields.displayName')}
            autoComplete="off"
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
              onChange={(event) => setRole(event.target.value as UserRole)}
            >
              <option value="technician">{t('users.roles.technician')}</option>
              <option value="admin">{t('users.roles.admin')}</option>
            </NativeSelect>
          </div>
          <FormError message={error} />
          <div className="flex gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {t('users.create.submit')}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function UsersPage() {
  const { t, i18n } = useTranslation();
  const users = useQuery({ queryKey: usersQueryKey, queryFn: listUsers });
  const [creating, setCreating] = useState(false);
  const [invitation, setInvitation] = useState<InvitationResponse | null>(null);

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t('users.title')}</h1>
        {!creating && !invitation ? (
          <Button onClick={() => setCreating(true)}>
            <UserPlus aria-hidden="true" className="size-4" />
            {t('users.create.open')}
          </Button>
        ) : null}
      </div>

      {invitation ? (
        <InvitationLinkCard invitation={invitation} onDone={() => setInvitation(null)} />
      ) : creating ? (
        <CreateUserForm
          onCreated={(created) => {
            setCreating(false);
            setInvitation(created);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {users.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : users.isError ? (
        <FormError message={t('auth.errors.generic')} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-4 py-2 font-medium">{t('auth.fields.displayName')}</th>
                <th className="px-4 py-2 font-medium">{t('auth.fields.username')}</th>
                <th className="px-4 py-2 font-medium">{t('users.fields.role')}</th>
                <th className="px-4 py-2 font-medium">{t('users.fields.status')}</th>
                <th className="px-4 py-2 font-medium">{t('users.fields.lastLogin')}</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link
                      to="/users/$userId"
                      params={{ userId: user.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {user.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{user.username}</td>
                  <td className="px-4 py-2">
                    <UserRoleLabel role={user.role} />
                  </td>
                  <td className="px-4 py-2">
                    <UserStatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {user.lastLoginAt
                      ? formatDateTime(user.lastLoginAt, i18n.language)
                      : t('users.neverLoggedIn')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
