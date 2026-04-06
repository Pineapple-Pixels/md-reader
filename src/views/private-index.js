import { pageHead, pageFoot } from './layout.js';
import { renderFileList } from './file-list.js';

export function renderPrivateIndex(files, meta) {
  let html = pageHead('Dashboard');

  html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <h1 style="font-size:1.5em">Mis documentos</h1>
    <div style="display:flex;gap:10px;align-items:center">
      <a href="/pub/" target="_blank" style="font-size:13px;color:#2563eb;text-decoration:none">Ver sitio publico</a>
      <button class="theme-toggle" onclick="toggleTheme()"></button>
      <form action="/api/auth/logout" method="POST" style="margin:0">
        <button type="submit" style="font-size:13px;color:var(--danger);background:none;border:none;cursor:pointer">Cerrar sesion</button>
      </form>
    </div>
  </div>`;

  // Create doc form
  html += `<div class="new-doc-form">
    <form action="/new" method="POST">
      <input type="text" name="file" placeholder="nombre.md o carpeta/nombre.md" required>
      <button type="submit">Crear documento</button>
    </form>
  </div>`;

  // Upload zone
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

  // Files list with visibility badges
  if (files.length) {
    html += renderFileList(files, {
      urlPrefix: '/doc/',
      projectPrefix: '/project/',
      actions: [
        { label: (name) => meta[name]?.public ? 'Publico' : 'Privado', cls: (name) => meta[name]?.public ? 'publish-btn' : 'action-btn', onclick: (name) => `toggleVis('${name}', this)` },
        { label: () => 'Descargar', cls: () => 'download-btn', onclick: (name) => `downloadDoc('${name}')` },
        { label: () => 'Eliminar', cls: () => 'delete-btn', onclick: (name) => `deleteDoc('${name}')` }
      ],
      meta
    });
  } else {
    html += `<p class="empty-msg">No hay documentos. Crea uno o subi archivos.</p>`;
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
        await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: path, content })
        });
      }
      progress.textContent = 'Listo! ' + mdFiles.length + ' archivos subidos.';
      showToast(mdFiles.length + ' archivos subidos', 'success');
      setTimeout(() => location.reload(), 800);
    }

    async function toggleVis(name, btn) {
      if (btn) btn.disabled = true;
      try {
        const res = await fetch('/api/toggle-visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: name })
        });
        const data = await res.json();
        if (data.ok) {
          if (btn) {
            btn.textContent = data.public ? 'Publico' : 'Privado';
            btn.className = 'action-btn ' + (data.public ? 'publish-btn' : '');
          }
          showToast(data.public ? name + ' es publico' : name + ' es privado', 'success');
        }
      } catch(e) {
        showToast('Error al cambiar visibilidad', 'error');
      }
      if (btn) btn.disabled = false;
    }

    function downloadDoc(name) {
      window.location.href = '/api/download?file=' + encodeURIComponent(name);
    }

    async function deleteDoc(name) {
      if (!confirm('Eliminar "' + name + '"? Se guardara una version de respaldo.')) return;
      const res = await fetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: name })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('"' + name + '" eliminado', 'success');
        setTimeout(() => location.reload(), 500);
      } else {
        showToast(data.error || 'Error al eliminar', 'error');
      }
    }
  </script>`;

  html += pageFoot({ private: true });
  return html;
}
