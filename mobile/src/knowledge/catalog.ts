import axios from 'axios';
import { endpoints } from '../api/endpoints';
import type { EntityRecord } from '../api/types';

export type DiscoveryCard = { key: string; title: string; category: 'news' | 'learning' | 'tech'; summary: string; load: (signal?: AbortSignal) => Promise<Record<string, unknown>> };
const remote = async (url: string, signal?: AbortSignal) => (await axios.get(url, { timeout: 8000, signal })).data;
const internal = (path: string, params?: Record<string, unknown>) => (signal?: AbortSignal) => endpoints.knowledgeDiscovery(path, params, signal);
export const discoveryCards: DiscoveryCard[] = [
  { key: 'coding_tip', title: 'Coding tip', category: 'tech', summary: 'A practical tip for better code.', load: internal('/coding_tip') },
  { key: 'dev_tool_of_the_day', title: 'Developer tool of the day', category: 'tech', summary: 'Explore a tool for your workflow.', load: internal('/dev_tool_of_the_day') },
  { key: 'open_issue_spotlight', title: 'Open-source spotlight', category: 'tech', summary: 'Find an open-source contribution idea.', load: internal('/open_issue_spotlight') },
  { key: 'tech_news', title: 'Tech news', category: 'tech', summary: 'Technology stories from Hacker News.', load: async signal => ({ articles: (await remote('https://hn.algolia.com/api/v1/search?tags=story&query=technology&hitsPerPage=5', signal)).hits.map((a: any) => ({ title: a.title, url: a.url || `https://news.ycombinator.com/item?id=${a.objectID}` })) }) },
  { key: 'top_news', title: 'Top news', category: 'news', summary: 'Browse the latest world headlines.', load: async signal => ({ articles: (await remote('https://api.rss2json.com/v1/api.json?rss_url=https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', signal)).items.slice(0, 5).map((a: any) => ({ title: a.title, url: a.link })) }) },
  { key: 'local_headlines', title: 'Local headlines', category: 'news', summary: 'News from your selected region.', load: internal('/news/local_headlines', { region: 'in' }) },
  { key: 'policy_briefs', title: 'Policy briefs', category: 'news', summary: 'Read important policy developments.', load: internal('/news/policy_briefs', { topic: 'global' }) },
  { key: 'science_news', title: 'Science news', category: 'news', summary: 'Discover new science and space stories.', load: async signal => ({ articles: (await remote('https://api.spaceflightnewsapi.net/v4/articles/?limit=5', signal)).results.map((a: any) => ({ title: a.title, url: a.url, summary: a.summary })) }) },
  { key: 'today_in_history', title: 'Today in history', category: 'learning', summary: 'Events that happened on this day.', load: async signal => { const now = new Date(); return { events: (await remote(`https://byabbe.se/on-this-day/${now.getMonth() + 1}/${now.getDate()}/events.json`, signal)).events.slice(0, 5) }; } },
  { key: 'quote_of_the_day', title: 'Quote of the day', category: 'learning', summary: 'A little inspiration for your day.', load: async signal => { const data = await remote('https://zenquotes.io/api/today', signal); return { q: data[0].q, a: data[0].a }; } },
  { key: 'daily_fact', title: 'Daily fact', category: 'learning', summary: 'Learn something unexpected.', load: async signal => ({ facts: [(await remote('https://uselessfacts.jsph.pl/api/v2/facts/random', signal)).text] }) },
  { key: 'common_english_word', title: 'English word', category: 'learning', summary: 'Build your vocabulary.', load: internal('/english_word') },
  { key: 'english_tense', title: 'English tense', category: 'learning', summary: 'Practice grammar with an example.', load: internal('/english_tense') },
  { key: 'english_phrase', title: 'English phrase', category: 'learning', summary: 'Learn a phrase and its meaning.', load: internal('/english_phrase') },
  { key: 'image_of_the_day', title: 'Image of the day', category: 'learning', summary: 'Explore the astronomy picture of the day.', load: async signal => { const data = await remote('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY', signal); return { title: data.title, explanation: data.explanation, url: data.url, media_type: data.media_type, copyright: data.copyright }; } },
  { key: 'daily_quiz', title: 'Daily quiz', category: 'learning', summary: 'Try a quick knowledge check.', load: async signal => { const data = (await remote('https://opentdb.com/api.php?amount=1&type=multiple', signal)).results[0]; if (!data) throw new Error('Quiz is unavailable'); return { id: `opentdb-${data.question}`, question: decodeEntities(data.question), options: [data.correct_answer, ...data.incorrect_answers].map(decodeEntities).sort(), correctAnswer: decodeEntities(data.correct_answer), explanation: `Category: ${data.category}`, source: 'Open Trivia DB' }; } },
];

export function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function readable(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join('\n');
  if (typeof value === 'object') return Object.entries(record(value)).map(([key, item]) => `${key.replace(/_/g, ' ')}: ${readable(item)}`).join('\n');
  return String(value);
}
export function decodeEntities(text: string): string {
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (raw, code) => {
    if (code[0] !== '#') return entities[code] || raw;
    const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : raw;
  });
}
export function contentFor(item: Record<string, unknown>, fallbackTitle = 'Knowledge card') {
  const payload = item.payload ? record(item.payload) : item;
  const articles = [payload.articles, payload.briefs, payload.events, payload.stocks, payload.definitions].find(Array.isArray) as unknown[] | undefined;
  const entries = (articles || []).map(value => {
    const row = record(value);
    const links = Array.isArray(row.wikipedia) ? row.wikipedia.map(record) : [];
    return { title: decodeEntities(readable(row.title || row.description || row.symbol || row.name || row.text || row.definition)), summary: readable(row.summary || row.excerpt || (row.symbol ? [row.change != null ? `Change: ${row.change}` : '', row.volume != null ? `Volume: ${row.volume}` : ''].filter(Boolean).join(' · ') : '')), url: safeUrl(row.url || row.link || links[0]?.wikipedia), year: readable(row.year) };
  });
  const title = decodeEntities(readable(item.title || payload.title || payload.name || payload.tense || payload.word || payload.question) || fallbackTitle);
  const summary = decodeEntities(readable(item.summary || payload.summary || payload.tip || payload.q || payload.phrase || payload.example || payload.description || payload.definition || payload.meaning || payload.note || payload.facts || entries[0]?.title));
  const body = decodeEntities(readable(item.body || payload.body || payload.explanation));
  return { payload, title, summary, body, entries, author: readable(payload.a || payload.author || payload.copyright), url: safeUrl(item.source_url || payload.source_url || payload.url), image: (payload.media_type === 'image' || item.card_type === 'image_of_the_day') ? safeUrl(payload.url) : undefined };
}
export function safeUrl(value: unknown): string | undefined { if (typeof value !== 'string') return; try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return; } }
export function generatedBookmark(item: EntityRecord) {
  return { card_type: 'mcp_knowledge_item', source_id: `knowledge_item:${item.id}`, payload: { ...item, knowledge_item_id: item.id, url: item.source_url }, collection_name: item.collection_name || 'ChatGPT Inbox', reminder_interval_days: 7 };
}
export function discoverySourceId(kind: string, payload: Record<string, unknown>): string {
  const first = record((payload.articles as unknown[] | undefined)?.[0]);
  const event = record((payload.events as unknown[] | undefined)?.[0]);
  switch (kind) {
    case 'coding_tip': return readable(payload.tip);
    case 'dev_tool_of_the_day': return readable(payload.url || payload.name);
    case 'open_issue_spotlight': return readable(payload.url || payload.title);
    case 'quote_of_the_day': return `${payload.q}-${payload.a || 'unknown'}`;
    case 'today_in_history': return `${event.year}-${readable(event.description).slice(0, 20)}`;
    case 'daily_fact': return readable((payload.facts as unknown[])?.[0]);
    case 'common_english_word': return readable(payload.word);
    case 'english_tense': return readable(payload.tense);
    case 'english_phrase': return readable(payload.phrase);
    case 'daily_quiz': return readable(payload.id || payload.question);
    case 'policy_briefs': return `${payload.topic}-${record((payload.briefs as unknown[])?.[0]).title || 'policy-brief'}`;
    case 'local_headlines': return `${payload.region}-${first.title || 'local-headlines'}`;
    default: return readable(payload.url || payload.question || first.title || payload.title) || kind;
  }
}
