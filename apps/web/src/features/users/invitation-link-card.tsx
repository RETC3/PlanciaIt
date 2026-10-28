import type { InvitationResponse } from '@planciait/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { invitationLink } from './api';

/** Shown once after creating a user or reissuing an invitation: the token is not stored. */
export function InvitationLinkCard({
  invitation,
  onDone,
}: {
  invitation: InvitationResponse;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const link = invitationLink(invitation.invitationToken);

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle>{t('users.invitation.title', { username: invitation.user.username })}</CardTitle>
        <CardDescription>
          {t('users.invitation.description', {
            expiresAt: formatDateTime(invitation.invitationExpiresAt, i18n.language),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="rounded-md border bg-secondary p-3 font-mono text-xs break-all select-all">
          {link}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? t('users.invitation.copied') : t('users.invitation.copy')}
          </Button>
          <Button onClick={onDone}>{t('users.invitation.done')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
