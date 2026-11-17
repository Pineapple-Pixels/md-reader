const SCRIPT_TAG = /<script[\s>/]/i;
const EVENT_ATTR = /<[a-z][^>]*?[\s"'/](on[a-z]+)\s*=/i;
const JS_URL = /<[^>]*javascript\s*:/i;

/**
 * Why an HTML document carries JavaScript, or null when it does not. It only warns the author:
 * an encoded trick can slip past it, so the frame CSP (no `allow-scripts`) is what stops scripts.
 */
export function findHtmlScript(html: string): string | null {
  if (SCRIPT_TAG.test(html)) return 'etiqueta <script>';
  const event = EVENT_ATTR.exec(html);
  if (event) return `atributo ${event[1]!.toLowerCase()}`;
  if (JS_URL.test(html)) return 'enlace javascript:';
  return null;
}
