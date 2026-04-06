import { pageHead, pageFoot } from './layout.js';
import { renderFileList } from './file-list.js';

export function renderPublicIndex(publicFiles) {
  let html = pageHead('Documentos publicos');
  html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <h1 style="font-size:1.5em">Documentos publicos</h1>
    <a href="/login" style="font-size:13px;color:#888;text-decoration:none">Admin</a>
  </div>`;

  if (publicFiles.length) {
    html += renderFileList(publicFiles, {
      urlPrefix: '/pub/',
      projectPrefix: '/pub/project/',
      actions: []
    });
  } else {
    html += `<p class="empty-msg">No hay documentos publicos disponibles.</p>`;
  }

  html += pageFoot();
  return html;
}
