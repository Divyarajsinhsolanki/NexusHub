export const DEFAULT_AVATAR_COLOR = '#6366f1';

export const generateAvatarColor = (seed = '') => {
  const palette = ['#047857', '#b91c1c', '#7e22ce', '#0369a1', '#be185d', '#a16207', '#0f766e', '#4338ca'];
  let hash = 0;
  for (const character of String(seed)) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  return palette[(hash >>> 0) % palette.length];
};

export const normalizeAvatarColor = (color, fallback = DEFAULT_AVATAR_COLOR) => (
  /^#[0-9a-f]{6}$/i.test((color || '').trim()) ? color.trim().toLowerCase() : fallback
);

export const getAvatarInitial = (name = '') => (
  name.toString().trim().charAt(0).toUpperCase() || '?'
);

export const getAvatarTextColor = (color) => {
  const normalized = normalizeAvatarColor(color);
  const hex = normalized.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.6 ? '#111827' : '#ffffff';
};

export const buildAvatarStyle = (color) => {
  const backgroundColor = normalizeAvatarColor(color);

  return {
    backgroundColor,
    color: getAvatarTextColor(backgroundColor),
  };
};
