export type MuteDuration = '1h' | '8h' | '1w' | 'forever';
export const MUTE_OPTIONS: { id: MuteDuration; label: string }[] = [
  { id: '1h', label: '1 hour' }, { id: '8h', label: '8 hours' }, { id: '1w', label: '1 week' }, { id: 'forever', label: 'Until I unmute' },
];
