import { afterEach, describe, expect, it } from 'vitest';
import { applyPageMeta, pageMetaFor } from './seo';

describe('pageMetaFor', () => {
  it('uses the www home page as the landing canonical', () => {
    expect(pageMetaFor('/')).toEqual({ canonical: 'https://www.meetcache.com/', noindex: false });
  });

  it('gives the privacy page its own canonical and title', () => {
    expect(pageMetaFor('/privacy')).toMatchObject({ canonical: 'https://www.meetcache.com/privacy', title: 'Privacy | Cache', noindex: false });
  });

  it('keeps the signed-in app out of the index', () => {
    expect(pageMetaFor('/app').noindex).toBe(true);
    expect(pageMetaFor('/app/settings').noindex).toBe(true);
    expect(pageMetaFor('/apple').noindex).toBe(false);
  });
});

describe('applyPageMeta', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('writes one canonical link and toggles the robots tag', () => {
    applyPageMeta('/app');
    applyPageMeta('/app');
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');

    applyPageMeta('/privacy');
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://www.meetcache.com/privacy');
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
