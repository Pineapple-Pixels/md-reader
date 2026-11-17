/**
 * Colors the code blocks of `container` as they come near the screen. highlight.js is only
 * downloaded when there is code. Returns a cleanup that stops watching.
 */
export function highlightCode(container: HTMLElement | null): () => void {
  const blocks = container ? [...container.querySelectorAll<HTMLElement>('pre code:not(.hljs)')] : [];
  if (blocks.length === 0) return () => {};
  let observer: IntersectionObserver | null = null;
  let cancelled = false;
  void import('highlight.js/lib/common').then(({ default: hljs }) => {
    if (cancelled) return;
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer?.unobserve(entry.target);
        hljs.highlightElement(entry.target as HTMLElement);
      }
    }, { rootMargin: '600px 0px' });
    blocks.forEach((b) => observer!.observe(b));
  });
  return () => {
    cancelled = true;
    observer?.disconnect();
  };
}
