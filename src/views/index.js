import { pageHead, pageFoot } from './layout.js';
import { renderFileList, renderLocalFileList } from './file-list.js';

export function renderIndex(cloudFiles, localFiles) {
  let html = pageHead('Documentos');

  // --- Cloud section ---
  html += `<div class="section-header"><h1>Cloud</h1><span class="section-badge cloud-badge">${cloudFiles.length}</span></div>`;
  html += `<div class="new-doc-form">
    <form action="/pub/new" method="POST">
      <input type="text" name="file" placeholder="nombre.md o carpeta/nombre.md" required>
      <button type="submit">Crear documento</button>
    </form>
  </div>`;

  if (cloudFiles.length) {
    html += renderFileList(cloudFiles, {
      urlPrefix: '/pub/',
      projectPrefix: '/pub/project/',
      actions: [
        { label: 'Descargar', cls: 'download-btn', onclick: (name) => `downloadDoc('${name}')` },
        { label: 'Eliminar', cls: 'delete-btn', onclick: (name) => `deleteCloud('${name}')` }
      ]
    });
  } else {
    html += `<p class="empty-msg">No hay documentos en la nube.</p>`;
  }

  // --- Local section ---
  html += `<div class="section-header" style="margin-top:40px"><h1>Local</h1><span class="section-badge local-badge">${localFiles.length}</span></div>`;

  html += `<div class="upload-actions">
    <label class="upload-btn file-btn">
      <input type="file" accept=".md" multiple style="display:none" onchange="handleFileSelect(this.files)">
      <span class="upload-icon">&#128196;</span> Subir Archivos
    </label>
    <label class="upload-btn folder-btn">
      <input type="file" webkitdirectory style="display:none" onchange="handleFolderSelect(this.files)">
      <span class="upload-icon">&#128193;</span> Subir Proyecto
    </label>
  </div>
  <div id="drop-zone" class="drop-zone">
    <p>O arrastra archivos .md / carpetas aca</p>
  </div>
  <div id="upload-progress" style="display:none;padding:8px 0;font-size:13px;color:#555"></div>`;

  if (localFiles.length) {
    html += renderLocalFileList(localFiles);
  } else {
    html += `<p class="empty-msg">No hay documentos locales. Usa <code>docpush</code> o arrastra un archivo.</p>`;
  }

  html += `<script>
    const dropZone = document.getElementById('drop-zone');
    const progress = document.getElementById('upload-progress');

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const allFiles = [];
        const entries = [];
        for (const item of items) {
          const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
          if (entry) entries.push(entry);
        }
        if (entries.length > 0 && entries.some(e => e.isDirectory)) {
          await readEntriesRecursive(entries, allFiles, '');
          await uploadFiles(allFiles);
          return;
        }
      }
      handleFileSelect(e.dataTransfer.files);
    });

    function readEntriesRecursive(entries, result, basePath) {
      return Promise.all(entries.map(entry => {
        if (entry.isFile) {
          return new Promise(resolve => {
            entry.file(file => {
              const path = basePath ? basePath + '/' + file.name : file.name;
              if (file.name.endsWith('.md')) result.push({ file, path });
              resolve();
            });
          });
        } else if (entry.isDirectory) {
          return new Promise(resolve => {
            const reader = entry.createReader();
            reader.readEntries(async (children) => {
              const prefix = basePath ? basePath + '/' + entry.name : entry.name;
              await readEntriesRecursive(children, result, prefix);
              resolve();
            });
          });
        }
        return Promise.resolve();
      }));
    }

    async function handleFileSelect(files) {
      const mdFiles = [];
      for (const file of files) {
        if (file.name.endsWith('.md')) mdFiles.push({ file, path: file.name });
      }
      await uploadFiles(mdFiles);
    }

    async function handleFolderSelect(files) {
      const mdFiles = [];
      for (const file of files) {
        if (!file.name.endsWith('.md')) continue;
        const path = file.webkitRelativePath || file.name;
        mdFiles.push({ file, path });
      }
      await uploadFiles(mdFiles);
    }

    async function uploadFiles(mdFiles) {
      if (mdFiles.length === 0) { alert('No se encontraron archivos .md'); return; }
      progress.style.display = 'block';
      let done = 0;
      for (const { file, path } of mdFiles) {
        done++;
        progress.textContent = 'Subiendo ' + done + '/' + mdFiles.length + ': ' + path;
        const content = await file.text();
        await fetch('/pub/api/local/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: path, content, device: 'browser' })
        });
      }
      progress.textContent = 'Listo! ' + mdFiles.length + ' archivos subidos.';
      setTimeout(() => location.reload(), 500);
    }

    async function publishLocal(name) {
      if (!confirm('Publicar "' + name + '" a la nube?')) return;
      const res = await fetch('/pub/api/local/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: name })
      });
      const data = await res.json();
      if (data.ok) location.reload();
      else alert(data.error || 'Error al publicar');
    }

    function downloadDoc(name) {
      window.location.href = '/pub/api/download?file=' + encodeURIComponent(name);
    }

    async function deleteCloud(name) {
      if (!confirm('Eliminar "' + name + '" del servidor? Se guardara una version de respaldo.')) return;
      const res = await fetch('/pub/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: name })
      });
      const data = await res.json();
      if (data.ok) location.reload();
      else alert(data.error || 'Error al eliminar');
    }

    async function deleteLocal(name, isFolder) {
      const label = isFolder ? 'la carpeta' : 'el archivo';
      if (!confirm('Eliminar ' + label + ' "' + name + '" del servidor?')) return;
      const res = await fetch('/pub/api/local/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: name, recursive: !!isFolder })
      });
      const data = await res.json();
      if (data.ok) location.reload();
      else alert(data.error || 'Error al eliminar');
    }
  </script>`;

  html += pageFoot();
  return html;
}
