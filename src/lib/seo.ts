export const SITE_ORIGIN = 'https://www.meetcache.com';

interface PageMeta {
  canonical: string;
  title?: string;
  noindex: boolean;
}

export function pageMetaFor(pathname: string): PageMeta {
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    return { canonical: `${SITE_ORIGIN}/app`, title: 'Cache', noindex: true };
  }
  if (pathname === '/privacy') {
    return { canonical: `${SITE_ORIGIN}/privacy`, title: 'Privacy | Cache', noindex: false };
  }
  return { canonical: `${SITE_ORIGIN}/`, noindex: false };
}

function upsert<T extends HTMLElement>(selector: string, create: () => T): T {
  const existing = document.head.querySelector<T>(selector);
  if (existing) return existing;
  const element = create();
  document.head.appendChild(element);
  return element;
}

export function applyPageMeta(pathname: string = window.location.pathname): void {
  const meta = pageMetaFor(pathname);

  const canonical = upsert('link[rel="canonical"]', () => {
    const link = document.createElement('link');
    link.rel = 'canonical';
    return link;
  });
  canonical.href = meta.canonical;

  if (meta.title) document.title = meta.title;

  const existingRobots = document.head.querySelector('meta[name="robots"]');
  if (meta.noindex) {
    const robots = upsert('meta[name="robots"]', () => {
      const tag = document.createElement('meta');
      tag.name = 'robots';
      return tag;
    });
    robots.content = 'noindex, nofollow';
  } else {
    existingRobots?.remove();
  }
}
