import { createRoot } from 'react-dom/client';
import { createElement, type ComponentType } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      retry: 1,
    },
  },
});

/**
 * Mount a React island component.
 * Reads props from a sibling <script type="application/json"> tag.
 */
export function mountIsland<P extends Record<string, unknown>>(
  Component: ComponentType<P>,
) {
  // Find all mount points for this island (script[data-island])
  const script = document.currentScript;
  if (!script) return;

  const id = script.getAttribute('src')?.match(/\/js\/(.+)\.js/)?.[1];
  if (!id) return;

  // Find all containers for this island
  document.querySelectorAll(`[data-island="${id}"]`).forEach((container) => {
    const propsEl = container.querySelector('script[type="application/json"]');
    const props = propsEl ? JSON.parse(propsEl.textContent || '{}') : {};

    const root = createRoot(container);
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Component, props as P),
      ),
    );
  });
}
