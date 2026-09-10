/**
 * Sequential ramps for the choropleth.
 *
 * Each is a single hue stepping light to dark. That is the shape a magnitude
 * scale needs: a multi-hue ramp reads as a rainbow, and its middle steps turn
 * muddy and stop meaning anything. Ordered low to high — the renderer picks a
 * step per region by where its value falls between the current min and max.
 */
export const PALETTES = {
  teal: ['#d9f1ed', '#b9e3dd', '#8fd1c8', '#5bb9ae', '#2f9c90', '#147b71', '#075b55'],
  blue: ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'],
  green: ['#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d'],
  amber: ['#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309'],
  red: ['#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c'],
  purple: ['#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9'],
  grey: ['#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563', '#374151', '#1f2937'],
} as const;

export type PaletteName = keyof typeof PALETTES;

export const PALETTE_OPTIONS = (Object.keys(PALETTES) as PaletteName[]).map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));

/** Ascending, de-duplicated band edges from a free-text field. */
export function parseThresholds(input: string): number[] {
  const values = (input ?? '')
    .split(/[,\s]+/)
    .map((part) => part.trim())
    // Splitting leaves empty strings around separators, and Number('') is 0 —
    // so without this an empty field parsed as the single edge [0], which reads
    // as "one threshold at zero" and quietly replaced the relative scale.
    .filter((part) => part.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Spread N+1 bands across the ramp's steps.
 *
 * Walking the ramp from index 0 would leave the top bands unused whenever there
 * are fewer thresholds than steps, so the darkest shade would never appear.
 */
export function bandColors(ramp: readonly string[], bandCount: number): string[] {
  if (bandCount <= 1) {
    return [ramp[ramp.length - 1] as string];
  }
  return Array.from({ length: bandCount }, (_, i) =>
    ramp[Math.round((i / (bandCount - 1)) * (ramp.length - 1))] as string
  );
}
