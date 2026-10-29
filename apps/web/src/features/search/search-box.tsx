import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';

/** True if the key press is meant for a field the user is typing in. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** The header search box; "/" focuses it from any page. */
export function SearchBox() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      event.preventDefault();
      input.current?.focus();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = text.trim();
    if (q === '') return;
    void navigate({ to: '/search', search: { q } });
  }

  return (
    <form role="search" className="relative w-full sm:w-64" onSubmit={handleSubmit}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={input}
        type="search"
        value={text}
        maxLength={200}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        title={t('search.shortcut')}
        className="pl-8"
        onChange={(event) => setText(event.target.value)}
      />
    </form>
  );
}
