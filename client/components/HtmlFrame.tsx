/**
 * Shows an HTML document. The server serves it with a CSP sandbox (opaque origin); the iframe
 * sandbox repeats the same limits so neither alone has to be trusted.
 */
export function HtmlFrame({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      className="html-frame"
      src={src}
      title={title}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
    />
  );
}
