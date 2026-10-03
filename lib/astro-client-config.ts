function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseVolumePercent(value: string | undefined): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 35;
  }

  return Math.min(100, Math.max(0, parsed));
}

export const ASTRO_MUSIC_ENABLED = parseBoolean(
  process.env.NEXT_PUBLIC_ASTRO_MUSIC_ENABLED,
);

export const ASTRO_MUSIC_VOLUME_PERCENT = parseVolumePercent(
  process.env.NEXT_PUBLIC_ASTRO_MUSIC_VOLUME_PERCENT,
);

export const ASTRO_MUSIC_VOLUME = ASTRO_MUSIC_VOLUME_PERCENT / 100;
