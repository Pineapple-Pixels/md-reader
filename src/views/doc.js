import { md } from '../lib/config.js';
import { pageHead, pageFoot } from './layout.js';

export function renderDoc(file, content, commentCount, { urlPrefix = '/pub/', isPublic = false, isFilePublic = false } = {}) {
  const rendered = md.render(content);
  const homeUrl = isPublic ? '/pub/' : '/';
  let html = pageHead(file);
  html += `<div class="toolbar">
    <a href="${homeUrl}">Volver</a>
    <a href="${urlPrefix}${file}?source">Codigo fuente${commentCount ? ` (${commentCount})` : ''}</a>`;

  if (!isPublic) {
    const visBtnLabel = isFilePublic ? 'Publico' : 'Privado';
    const visBtnClass = isFilePublic ? 'publish-btn' : 'action-btn';
    html += `
    <a href="${urlPrefix}${file}?edit=1" class="primary">Editar</a>
    <button class="action-btn download-btn" onclick="window.location.href='/api/download?file=${encodeURIComponent(file)}'">Descargar</button>
    <button id="vis-toggle" class="action-btn ${visBtnClass}" onclick="toggleVis()">${visBtnLabel}</button>
    <button class="action-btn delete-btn" onclick="deleteThis()">Eliminar</button>
    <button class="theme-toggle" onclick="toggleTheme()"></button>`;
  }

  html += `</div>`;
  html += `<div class="doc">${rendered}</div>`;

  if (!isPublic) {
    html += `<script>
    async function deleteThis() {
      if (!confirm('Eliminar este documento?')) return;
      const res = await fetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: ${JSON.stringify(file)} })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Documento eliminado', 'success');
        setTimeout(() => window.location.href = '/', 500);
      } else {
        showToast(data.error || 'Error al eliminar', 'error');
      }
    }
    async function toggleVis() {
      const btn = document.getElementById('vis-toggle');
      btn.disabled = true;
      try {
        const res = await fetch('/api/toggle-visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: ${JSON.stringify(file)} })
        });
        const data = await res.json();
        if (data.ok) {
          btn.textContent = data.public ? 'Publico' : 'Privado';
          btn.className = 'action-btn ' + (data.public ? 'publish-btn' : '');
          showToast(data.public ? 'Ahora es publico' : 'Ahora es privado', 'success');
        }
      } catch(e) {
        showToast('Error al cambiar visibilidad', 'error');
      }
      btn.disabled = false;
    }
    </script>`;
  }

  html += pageFoot({ private: !isPublic });
  return html;
}
