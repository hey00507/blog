export const categories = {
  reading: { label: '독서', color: 'var(--color-accent-reading)' },
  essay: { label: '일상', color: 'var(--color-accent-essay)' },
  dev: { label: '코딩', color: 'var(--color-accent-dev)' },
} as const;

export type Category = keyof typeof categories;
