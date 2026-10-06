import { attachmentMedia } from './attachmentMedia';

jest.mock('../api/client', () => ({ absoluteAssetUrl: (path: string) => `https://example.com${path}` }));

describe('attachmentMedia', () => {
  it('detects images with generic or missing MIME types', () => {
    expect(attachmentMedia({ filename: 'photo.JPG', content_type: 'application/octet-stream', url: '/photo' }).kind).toBe('image');
    expect(attachmentMedia({ url: 'https://example.com/photo.png?token=abc' }).kind).toBe('image');
  });
  it('detects videos and resolves relative URLs', () => {
    expect(attachmentMedia({ filename: 'clip.mp4', url: '/clip' })).toEqual({ filename: 'clip.mp4', url: 'https://example.com/clip', kind: 'video' });
    expect(attachmentMedia({ content_type: 'video/quicktime', url: 'https://example.com/clip' }).kind).toBe('video');
  });
  it('rejects executable URLs and keeps documents as files', () => {
    expect(attachmentMedia({ url: 'javascript:alert(1)' }).url).toBe('');
    expect(attachmentMedia({ filename: 'report.pdf', url: '/report' }).kind).toBe('file');
  });
});
import { describe, expect, it, jest } from '@jest/globals';
