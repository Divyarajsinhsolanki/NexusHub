import { describe, it, expect } from 'vitest';
import { splitMessageLinks } from './messageLinks';
import { splitMessageLinks as mobileLinks } from '../../../mobile/src/chat/messageLinks';

describe.each([['web', splitMessageLinks], ['mobile', mobileLinks]])('%s message links', (_, split) => {
  it('keeps punctuation and balanced URL parentheses', () => {
    const text = 'See (https://example.com/wiki/Test_(one)), then www.example.com.';
    const parts = split(text);
    expect(parts.map(part => part.text).join('')).toBe(text);
    expect(parts.filter(part => part.url).map(part => part.url)).toEqual(['https://example.com/wiki/Test_(one)', 'https://www.example.com/']);
  });
  it('does not make credentials or unsafe schemes clickable', () => {
    expect(split('javascript:alert(1) https://user:password@example.com').some(part => part.url)).toBe(false);
  });
  it('keeps fragments, query strings and mentions intact', () => {
    const text = '@sam https://example.com?a=1&b=2#section #TASK-1';
    expect(split(text).map(part => part.text).join('')).toBe(text);
    expect(split(text).find(part => part.url).url).toBe('https://example.com/?a=1&b=2#section');
  });
});
