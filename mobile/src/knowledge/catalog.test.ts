import { expect, test } from '@jest/globals';
import { contentFor, discoveryCards, discoverySourceId, generatedBookmark, safeUrl } from './catalog';

test('provides discovery cards even without generated workspace items', () => {
  expect(discoveryCards.length).toBeGreaterThanOrEqual(16);
  expect(new Set(discoveryCards.map(card => card.key)).size).toBe(discoveryCards.length);
  expect(discoveryCards.map(card => card.key)).toEqual(expect.arrayContaining(['coding_tip', 'local_headlines', 'science_news', 'daily_quiz']));
});
test('renders saved web payloads without losing tips, quotes, articles or sources', () => {
  expect(contentFor({ payload: { tip: 'Write useful tests' } }, 'Coding tip').summary).toBe('Write useful tests');
  expect(contentFor({ payload: { q: 'Keep learning', a: 'Sam' } }).author).toBe('Sam');
  const news = contentFor({ payload: { articles: [{ title: 'Science &amp; technology', url: 'https://example.com/article' }] } });
  expect(news.entries[0].title).toBe('Science & technology');
  expect(news.entries[0].url).toBe('https://example.com/article');
  expect(contentFor({ payload: { stocks: [{ symbol: 'TEST', change: '2%', volume: 10 }] } }).entries[0].summary).toBe('Change: 2% · Volume: 10');
  expect(contentFor({ payload: { definitions: [{ text: 'A useful definition' }] } }).entries[0].title).toBe('A useful definition');
  expect(contentFor({ payload: { body: [{ title: 'Step', detail: 'Do this' }] } }).body).toContain('detail: Do this');
});
test('generated bookmarks use the same identity as web', () => {
  const input = generatedBookmark({ id: 7, title: 'Daily technology', collection_name: 'Learning' });
  expect(input.card_type).toBe('mcp_knowledge_item');
  expect(input.source_id).toBe('knowledge_item:7');
  expect(input.payload.knowledge_item_id).toBe(7);
  expect(input.collection_name).toBe('Learning');
  expect(discoverySourceId('coding_tip', { tip: 'Keep functions small' })).toBe('Keep functions small');
  expect(discoverySourceId('policy_briefs', { topic: 'global', briefs: [{ title: 'A brief' }] })).toBe('global-A brief');
});
test('refuses unsafe source schemes and links containing credentials', () => {
  expect(safeUrl('javascript:alert(1)')).toBeUndefined();
  expect(safeUrl('https://user:pass@example.com')).toBeUndefined();
  expect(safeUrl('https://example.com')).toBe('https://example.com/');
});
