// Stroke icons (24×24 grid). Decorative by default; pass `label` to expose to screen readers.

const PATHS: Record<string, string> = {
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 18l6-6-6-6',
  plus: 'M12 5v14M5 12h14',
  close: 'M18 6L6 18M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  trips: 'M3 7h18v13H3zM8 7V4h8v3M3 12h18',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  flight: 'M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  hotel: 'M2 20V8M2 14h20v6M22 20v-6a3 3 0 00-3-3h-8v3M6 12.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  train: 'M6 3h12a2 2 0 012 2v10a3 3 0 01-3 3H7a3 3 0 01-3-3V5a2 2 0 012-2zM4 11h16M12 3v8M8 15h.01M16 15h.01M7 18l-2 3M17 18l2 3',
  bus: 'M5 4h14a1 1 0 011 1v12H4V5a1 1 0 011-1zM4 11h16M8 17v2M16 17v2M7.5 14h.01M16.5 14h.01',
  car: 'M5 17h14v-4l-2-5H7l-2 5v4zM5 13h14M7.5 15.5h.01M16.5 15.5h.01M6 17v2M18 17v2',
  ferry: 'M2 20c2 1 4 1 6 0s4-1 6 0 4 1 6 0M4 16l2-5h12l2 5M8 11V7h8v4M12 4v3',
  activity: 'M3 9a3 3 0 010 6v3h18v-3a3 3 0 010-6V6H3v3zM13 6v2M13 11v2M13 16v2',
  restaurant: 'M7 2v20M4 2v6a3 3 0 006 0V2M17 2c-2 2-3 4-3 8h3v12',
  sight: 'M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  note: 'M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h6',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  directions: 'M12 2l10 10-10 10L2 12 12 2zM9 13v-2a2 2 0 012-2h4M13 7l2 2-2 2',
  share: 'M12 3v13M7 8l5-5 5 5M5 12v8h14v-8',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  sunrise: 'M12 2v6M5.2 10.2l1.4 1.4M2 18h2M20 18h2M17.4 11.6l1.4-1.4M22 22H2M8 6l4-4 4 4M16 18a4 4 0 00-8 0',
  sunset: 'M12 9V2M5.2 10.2l1.4 1.4M2 18h2M20 18h2M17.4 11.6l1.4-1.4M22 22H2M16 5l-4 4-4-4M16 18a4 4 0 00-8 0',
  wind: 'M3 8h11a3 3 0 10-3-3M3 16h15a3 3 0 11-3 3M3 12h18',
  drop: 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z',
  refresh: 'M21 12a9 9 0 11-2.6-6.4M21 3v6h-6',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  phone: 'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8.1 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z',
  walk: 'M13 4a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM9 22l3-8 3 3v5M7 12l3-5 4 1 3 3M10 7l-1 6',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  globe: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
  ext: 'M15 3h6v6M10 14L21 3M19 14v7H3V5h7',
  shirt: 'M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 01-8 0z',
  ticket: 'M3 9a3 3 0 010 6v3h18v-3a3 3 0 010-6V6H3v3z',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, label, stroke = 2 }: { name: string; size?: number; label?: string; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      <path d={PATHS[name] ?? PATHS.note} />
    </svg>
  );
}
