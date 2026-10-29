import type { AreaPermission, AreaSummary } from '@planciait/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { fetchSession, sessionQueryKey } from '@/features/auth/api';
import { FormError } from '@/features/auth/form';
import { listUsers, usersQueryKey } from '@/features/users/api';
import { UserStatusBadge } from '@/features/users/user-badges';
import { ApiError } from '@/lib/api';
import {
  areaMembersQueryKey,
  areaQueryKey,
  areasQueryKey,
  deleteArea,
  getArea,
  listAreaMembers,
  removeAreaMember,
  setAreaMember,
  updateArea,
} from './api';
import { AreaForm } from './area-form';
import { AreaPermissionBadge } from './area-permission-badge';
import { areaErrorMessage } from './errors';

function PermissionSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: AreaPermission;
  disabled?: boolean;
  onChange: (permission: AreaPermission) => void;
}) {
  const { t } = useTranslation();
  return (
    <NativeSelect
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as AreaPermission)}
    >
      <option value="read">{t('areas.permissions.read')}</option>
      <option value="write">{t('areas.permissions.write')}</option>
    </NativeSelect>
  );
}

function EditAreaCard({ area }: { area: AreaSummary }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: (values: { name: string; description: string }) => updateArea(area.id, values),
    onSuccess: async (updated) => {
      setSaved(true);
      queryClient.setQueryData(areaQueryKey(updated.id), updated);
      await queryClient.invalidateQueries({ queryKey: areasQueryKey, exact: true });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('areas.detail.details')}</CardTitle>
      </CardHeader>
      <CardContent>
        <AreaForm
          initial={{ name: area.name, description: area.description ?? '' }}
          error={mutation.isError ? mutation.error : null}
          onSubmit={(values) => {
            setSaved(false);
            mutation.mutate(values);
          }}
        >
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={mutation.isPending}>
              {t('common.save')}
            </Button>
            {saved ? (
              <span className="text-sm text-muted-foreground">{t('common.saved')}</span>
            ) : null}
          </div>
        </AreaForm>
      </CardContent>
    </Card>
  );
}

function MembersCard({ areaId }: { areaId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: areaMembersQueryKey(areaId),
    queryFn: () => listAreaMembers(areaId),
  });
  const users = useQuery({ queryKey: usersQueryKey, queryFn: listUsers });
  const [newUserId, setNewUserId] = useState('');
  const [newPermission, setNewPermission] = useState<AreaPermission>('read');

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: areaMembersQueryKey(areaId) });
  }

  const setMember = useMutation({
    mutationFn: ({ userId, permission }: { userId: string; permission: AreaPermission }) =>
      setAreaMember(areaId, userId, permission),
    onSuccess: refresh,
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => removeAreaMember(areaId, userId),
    onSuccess: refresh,
  });

  const memberIds = new Set(members.data?.map((member) => member.userId));
  const candidates = (users.data ?? []).filter(
    (user) => user.role === 'technician' && user.status !== 'disabled' && !memberIds.has(user.id),
  );

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newUserId) return;
    setMember.mutate(
      { userId: newUserId, permission: newPermission },
      { onSuccess: () => setNewUserId('') },
    );
  }

  const failed = [setMember, removeMember].find((mutation) => mutation.isError);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('areas.members.title')}</CardTitle>
        <CardDescription>{t('areas.members.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {members.isPending ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : members.isError ? (
          <FormError message={t('auth.errors.generic')} />
        ) : members.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('areas.members.empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">{t('auth.fields.displayName')}</th>
                  <th className="px-4 py-2 font-medium">{t('users.fields.status')}</th>
                  <th className="px-4 py-2 font-medium">{t('areas.fields.permission')}</th>
                  <th className="px-4 py-2">
                    <span className="sr-only">{t('areas.members.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.data.map((member) => (
                  <tr key={member.userId} className="border-t">
                    <td className="px-4 py-2">
                      <Link
                        to="/users/$userId"
                        params={{ userId: member.userId }}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {member.displayName}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {member.username}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <UserStatusBadge status={member.status} />
                    </td>
                    <td className="px-4 py-2">
                      <PermissionSelect
                        id={`permission-${member.userId}`}
                        value={member.permission}
                        disabled={setMember.isPending}
                        onChange={(permission) =>
                          setMember.mutate({ userId: member.userId, permission })
                        }
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={removeMember.isPending}
                        aria-label={t('areas.members.removeLabel', { name: member.displayName })}
                        onClick={() => {
                          if (window.confirm(t('areas.confirm.removeMember'))) {
                            removeMember.mutate(member.userId);
                          }
                        }}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {candidates.length > 0 ? (
          <form className="flex flex-wrap items-end gap-3" onSubmit={handleAdd}>
            <div className="grid min-w-48 flex-1 gap-2">
              <Label htmlFor="newMember">{t('areas.members.user')}</Label>
              <NativeSelect
                id="newMember"
                value={newUserId}
                required
                onChange={(event) => setNewUserId(event.target.value)}
              >
                <option value="">{t('areas.members.choose')}</option>
                {candidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} ({user.username})
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid w-40 gap-2">
              <Label htmlFor="newPermission">{t('areas.fields.permission')}</Label>
              <PermissionSelect
                id="newPermission"
                value={newPermission}
                onChange={setNewPermission}
              />
            </div>
            <Button type="submit" disabled={setMember.isPending || !newUserId}>
              {t('areas.members.add')}
            </Button>
          </form>
        ) : users.isSuccess ? (
          <p className="text-sm text-muted-foreground">{t('areas.members.noCandidates')}</p>
        ) : null}

        <FormError message={failed ? areaErrorMessage(failed.error, t) : null} />
      </CardContent>
    </Card>
  );
}

function DeleteAreaCard({ area }: { area: AreaSummary }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteArea(area.id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: areaQueryKey(area.id) });
      await queryClient.invalidateQueries({ queryKey: areasQueryKey, exact: true });
      await navigate({ to: '/areas' });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('areas.delete.title')}</CardTitle>
        <CardDescription>{t('areas.delete.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => {
              if (window.confirm(t('areas.confirm.delete', { name: area.name }))) {
                mutation.mutate();
              }
            }}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {t('areas.delete.submit')}
          </Button>
        </div>
        <FormError
          message={
            !mutation.isError
              ? null
              : mutation.error instanceof ApiError && mutation.error.status === 409
                ? t('areas.errors.notEmpty')
                : areaErrorMessage(mutation.error, t)
          }
        />
      </CardContent>
    </Card>
  );
}

export function AreaDetailPage({ areaId }: { areaId: string }) {
  const { t } = useTranslation();
  const session = useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession });
  const area = useQuery({ queryKey: areaQueryKey(areaId), queryFn: () => getArea(areaId) });
  // UX only: every admin action below is enforced again by the API.
  const isAdmin = session.data?.user.role === 'admin';

  return (
    <div className="grid max-w-3xl gap-6">
      <Link
        to="/areas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('areas.title')}
      </Link>

      {area.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : area.isError ? (
        <FormError
          message={
            area.error instanceof ApiError && area.error.status === 404
              ? t('areas.errors.notFound')
              : t('auth.errors.generic')
          }
        />
      ) : (
        <>
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold">{area.data.name}</h1>
              {isAdmin ? null : <AreaPermissionBadge permission={area.data.permission} />}
            </div>
            {area.data.description ? (
              <p className="text-sm whitespace-pre-line text-muted-foreground">
                {area.data.description}
              </p>
            ) : null}
          </div>

          {isAdmin ? (
            <>
              <EditAreaCard key={area.data.id} area={area.data} />
              <MembersCard areaId={area.data.id} />
              <DeleteAreaCard area={area.data} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('areas.detail.comingSoon')}</p>
          )}
        </>
      )}
    </div>
  );
}
