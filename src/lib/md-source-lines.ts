/**
 * Plugin de markdown-it que inyecta atributos `data-source-line` en
 * los tokens de bloque que tienen mapping a lineas del fuente.
 *
 * Esto permite al frontend asociar comentarios (que referencian lineas
 * del markdown original) con los elementos HTML renderizados.
 */
import type MarkdownIt from 'markdown-it';

const BLOCK_OPEN_TOKENS = new Set([
  'paragraph_open',
  'heading_open',
  'blockquote_open',
  'bullet_list_open',
  'ordered_list_open',
  'list_item_open',
  'table_open',
  'fence',
  'code_block',
  'hr',
]);

export function sourceLinePlugin(md: MarkdownIt): void {
  md.core.ruler.push('source_line_attrs', (state) => {
    for (const token of state.tokens) {
      if (token.map && BLOCK_OPEN_TOKENS.has(token.type)) {
        // map = [startLine, endLine] (0-based). Convertimos a 1-based para
        // coincidir con la numeracion que ve el usuario en SourcePage.
        token.attrSet('data-source-line', String(token.map[0] + 1));
        token.attrSet('data-source-line-end', String(token.map[1]));
      }
    }
  });
}
