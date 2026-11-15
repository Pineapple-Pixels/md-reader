import DOMPurify from 'dompurify';

/**
 * Sanitizes rendered document HTML before it goes into the app page. MDX may carry raw HTML:
 * forms and buttons would act with the viewer's session, and <style>/style= would restyle the app.
 */
export function sanitizeDocHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'option', 'fieldset', 'style', 'link', 'meta', 'base', 'dialog', 'template'],
    FORBID_ATTR: ['style', 'action', 'formaction', 'form', 'target'],
  });
}
