import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FolderPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchSession, sessionQueryKey } from '@/features/auth/api';
import { FormError } from '@/features/auth/form';
import { areasQueryKey, createArea, listAreas } from './api';
import { AreaForm } from './area-form';
import { AreaPermissionBadge } from './area-permission-badge';

function CreateAreaCard({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createArea,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: areasQueryKey, exact: true });
      onDone();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('areas.create.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <AreaForm
          initial={{ name: '', description: '' }}
          error={mutation.isError ? mutation.error : null}
          onSubmit={(values) => mutation.mutate(values)}
        >
          <div className="flex gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {t('areas.create.submit')}
            </Button>
            <Button variant="ghost" onClick={onDone}>
              {t('common.cancel')}
            </Button>
          </div>
        </AreaForm>
      </CardContent>
    </Card>
  );
}

export function AreasPage() {
  const { t } = useTranslation();
  const session = useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession });
  const areas = useQuery({ queryKey: areasQueryKey, queryFn: listAreas });
  const [creating, setCreating] = useState(false);
  // UX only: the API rejects area changes from technicians on its own.
  const isAdmin = session.data?.user.role === 'admin';

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('areas.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? t('areas.descriptionAdmin') : t('areas.descriptionTechnician')}
          </p>
        </div>
        {isAdmin && !creating ? (
          <Button onClick={() => setCreating(true)}>
            <FolderPlus aria-hidden="true" className="size-4" />
            {t('areas.create.open')}
          </Button>
        ) : null}
      </div>

      {creating ? <CreateAreaCard onDone={() => setCreating(false)} /> : null}

      {areas.isPending ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : areas.isError ? (
        <FormError message={t('auth.errors.generic')} />
      ) : areas.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isAdmin ? t('areas.emptyAdmin') : t('areas.emptyTechnician')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-4 py-2 font-medium">{t('areas.fields.name')}</th>
                <th className="px-4 py-2 font-medium">{t('areas.fields.description')}</th>
                {isAdmin ? null : (
                  <th className="px-4 py-2 font-medium">{t('areas.fields.permission')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {areas.data.map((area) => (
                <tr key={area.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link
                      to="/areas/$areaId"
                      params={{ areaId: area.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {area.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{area.description}</td>
                  {isAdmin ? null : (
                    <td className="px-4 py-2">
                      <AreaPermissionBadge permission={area.permission} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
