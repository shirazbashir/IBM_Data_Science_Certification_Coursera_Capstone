import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item, ItemKind } from '../types';
import { navigate } from '../router';
import { useAppState } from '../state';
import { Icon } from './Icon';

export const KIND_META: Record<ItemKind, { label: string; icon: string }> = {
  flight: { label: 'Flight', icon: 'flight' },
  hotel: { label: 'Hotel', icon: 'hotel' },
  train: { label: 'Train', icon: 'train' },
  bus: { label: 'Bus', icon: 'bus' },
  car: { label: 'Car rental', icon: 'car' },
  ferry: { label: 'Ferry', icon: 'ferry' },
  activity: { label: 'Activity', icon: 'activity' },
  restaurant: { label: 'Restaurant', icon: 'restaurant' },
  sight: { label: 'Sightseeing', icon: 'sight' },
  note: { label: 'Note', icon: 'note' },
};

export function KindDot({ item }: { item: Pick<Item, 'kind'> }) {
  return (
    <span class={`dot k-${item.kind}`}>
      <Icon name={KIND_META[item.kind].icon} size={20} />
    </span>
  );
}

interface LinkProps {
  href: string;
  replace?: boolean;
  class?: string;
  style?: Record<string, string>;
  children?: ComponentChildren;
  onClick?: (e: MouseEvent) => void;
  'aria-label'?: string;
  'aria-current'?: 'page';
}

/** In-app link that keeps our back-stack accounting right. */
export function Link({ href, replace, onClick, style, ...rest }: LinkProps) {
  return (
    <a
      {...rest}
      style={style as JSX.IntrinsicElements['a']['style']}
      href={`#${href}`}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        navigate(href, { replace });
      }}
    />
  );
}

/** Moves focus to the page heading on navigation so screen readers announce the new screen. */
export function usePageTitle(title: string) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = title ? `${title} · Wayfare` : 'Wayfare';
    ref.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [title]);
  return ref;
}

export function TabBar({ active }: { active: 'trips' | 'import' | 'settings' | 'none' }) {
  const tabs = [
    { id: 'trips', href: '/', icon: 'trips', label: 'Trips' },
    { id: 'import', href: '/import', icon: 'mail', label: 'Scan Gmail' },
    { id: 'settings', href: '/settings', icon: 'settings', label: 'Settings' },
  ] as const;
  return (
    <nav class="tabbar" aria-label="Main">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} replace aria-current={active === t.id ? 'page' : undefined}>
          <Icon name={t.icon} size={24} />
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function Toasts() {
  const toasts = useAppState((s) => s.toasts);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} class={`toast ${t.tone ?? ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <span class="switch">
      <input
        type="checkbox"
        role="switch"
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)}
      />
      <span aria-hidden="true" />
    </span>
  );
}

export function Empty({ art, title, children }: { art: string; title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="art" aria-hidden="true">
        {art}
      </div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data?: T; error?: Error; loading: boolean } {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (error: Error) => alive && setState({ error, loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** A pleasant deterministic gradient for a destination name (used behind/instead of photos). */
export function gradientFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  const b = (a + 40 + (h % 60)) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 42%), hsl(${b} 75% 30%))`;
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      class="icon-btn"
      aria-label={done ? 'Copied' : label}
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={18} />
    </button>
  );
}
