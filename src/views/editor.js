import { pageHead, pageFoot } from './layout.js';

export function renderEditor(file, content, { urlPrefix = '/pub/', saveEndpoint = '/pub/save', local = false } = {}) {
  let html = pageHead(`Editando: ${file}`);
  html += `<div class="toolbar">
    <a href="/pub/">Volver</a>
    ${local ? '<span class="local-tag">LOCAL</span>' : ''}
    <a href="${urlPrefix}${file}">Ver renderizado</a>
    <button class="primary" onclick="saveDoc()">Guardar</button>
    <span id="save-status" style="font-size:13px;color:#888;align-self:center;margin-left:4px;"></span>
  </div>`;
  html += `<div class="editor-wrap">
    <textarea id="editor">${content.replace(/</g, '&lt;')}</textarea>
  </div>`;
  html += `<script>
    const editor = document.getElementById('editor');
    const status = document.getElementById('save-status');
    const SAVE_URL = ${JSON.stringify(saveEndpoint)};
    const VIEW_URL = ${JSON.stringify(urlPrefix + file)};
    let autoSaveTimer = null;
    let saving = false;

    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = start + 2;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveDoc();
      }
    });

    editor.addEventListener('input', () => {
      clearTimeout(autoSaveTimer);
      status.textContent = 'Sin guardar...';
      status.style.color = '#d97706';
      autoSaveTimer = setTimeout(() => autoSave(), 3000);
    });

    async function autoSave() {
      if (saving) return;
      saving = true;
      status.textContent = 'Guardando...';
      status.style.color = '#888';
      try {
        const res = await fetch(SAVE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: ${JSON.stringify(file)}, content: editor.value })
        });
        const data = await res.json();
        if (data.ok) {
          status.textContent = 'Guardado';
          status.style.color = '#16a34a';
        }
      } catch(e) {
        status.textContent = 'Error al guardar';
        status.style.color = '#dc2626';
      }
      saving = false;
    }

    async function saveDoc() {
      clearTimeout(autoSaveTimer);
      if (saving) return;
      saving = true;
      status.textContent = 'Guardando...';
      status.style.color = '#888';
      try {
        const res = await fetch(SAVE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: ${JSON.stringify(file)}, content: editor.value })
        });
        const data = await res.json();
        if (data.ok) window.location.href = VIEW_URL;
      } catch(e) {
        status.textContent = 'Error al guardar';
        status.style.color = '#dc2626';
      }
      saving = false;
    }
  </script>`;
  html += pageFoot();
  return html;
}
