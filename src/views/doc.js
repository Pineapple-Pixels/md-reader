import { md } from '../lib/config.js';
import { pageHead, pageFoot } from './layout.js';

export function renderDoc(file, content, commentCount, { urlPrefix = '/pub/', local = false } = {}) {
  const rendered = md.render(content);
  let html = pageHead(file);
  html += `<div class="toolbar">
    <a href="/pub/">Volver</a>
    ${local ? '<span class="local-tag">LOCAL</span>' : ''}
    <a href="${urlPrefix}${file}?source">Codigo fuente${commentCount ? ` (${commentCount})` : ''}</a>
    <a href="${urlPrefix}${file}?edit=1" class="primary">Editar</a>
    ${local ? `<button class="action-btn publish-btn" onclick="publishThis()">Publicar a Cloud</button>` : `<button class="action-btn download-btn" onclick="window.location.href='/pub/api/download?file=${encodeURIComponent(file)}'">Descargar</button>`}
    <button class="action-btn delete-btn" onclick="deleteThis()">Eliminar</button>
  </div>`;
  html += `<div class="doc">${rendered}</div>`;
  html += `<script>
    async function deleteThis() {
      if (!confirm('Eliminar este documento?')) return;
      const endpoint = ${JSON.stringify(local)} ? '/pub/api/local/delete' : '/pub/api/delete';
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: ${JSON.stringify(file)} })
      });
      const data = await res.json();
      if (data.ok) window.location.href = '/pub/';
      else alert(data.error || 'Error al eliminar');
    }
    ${local ? `
    async function publishThis() {
      if (!confirm('Publicar este documento a la nube?')) return;
      const res = await fetch('/pub/api/local/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: ${JSON.stringify(file)} })
      });
      const data = await res.json();
      if (data.ok) window.location.href = data.url;
      else alert(data.error || 'Error al publicar');
    }` : ''}
  </script>`;
  html += pageFoot();
  return html;
}
