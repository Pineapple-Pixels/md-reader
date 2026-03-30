import { md } from '../lib/config.js';
import { flattenTree, renderTreeHtml } from '../lib/tree.js';

export function renderProject(projectName, tree, currentFile, currentContent, { urlPrefix = '/pub/', local = false, apiBase = '' } = {}) {
  const rendered = md.render(currentContent);
  const allPages = flattenTree(tree);

  let html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} — Docs</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; background: #fafafa; }
    .project-layout { display: flex; height: 100vh; flex-direction: column; }
    .project-toolbar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #e0e0e0; background: white; flex-wrap: wrap; }
    .project-toolbar a, .project-toolbar button { padding: 4px 12px; border-radius: 5px; text-decoration: none; font-size: 13px; cursor: pointer; border: 1px solid #d0d0d0; background: white; color: #555; transition: all 0.15s; }
    .project-toolbar a:hover, .project-toolbar button:hover { background: #f0f0f0; }
    .project-toolbar .primary { background: #2563eb; color: white; border-color: #2563eb; }
    .project-toolbar .primary:hover { background: #1d4ed8; }
    .project-toolbar .title { font-weight: 600; font-size: 15px; margin-right: auto; }
    .local-tag { display: inline-block; background: #fef3c7; color: #92400e; font-size: 11px; padding: 1px 8px; border-radius: 4px; margin-left: 4px; font-weight: 600; }
    .project-body { display: flex; flex: 1; overflow: hidden; }
    .project-sidebar { width: 260px; min-width: 200px; border-right: 1px solid #e0e0e0; overflow-y: auto; background: #f8fafc; padding: 8px 0; flex-shrink: 0; }
    .sidebar-tree { list-style: none; padding: 0; margin: 0; }
    .sidebar-tree li { margin: 0; }
    .sidebar-tree .tree-item { display: flex; align-items: center; padding: 5px 16px; cursor: pointer; font-size: 13px; color: #444; text-decoration: none; border-left: 3px solid transparent; transition: all 0.1s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sidebar-tree .tree-item:hover { background: #eff6ff; color: #1d4ed8; }
    .sidebar-tree .tree-item.active { background: #dbeafe; color: #1d4ed8; border-left-color: #2563eb; font-weight: 600; }
    .sidebar-tree .tree-folder > .tree-item { font-weight: 600; color: #555; font-size: 13px; padding-top: 8px; cursor: pointer; }
    .sidebar-tree .tree-folder > .tree-item:hover { background: #eff6ff; color: #1d4ed8; }
    .tree-chevron { font-size: 9px; margin-right: 4px; transition: transform 0.15s; display: inline-block; flex-shrink: 0; }
    .tree-folder:not(.collapsed) > .tree-item .tree-chevron { transform: rotate(90deg); }
    .tree-children { overflow: hidden; transition: max-height 0.2s ease; max-height: 500px; }
    .tree-folder.collapsed > .tree-children { max-height: 0; }
    .sidebar-tree .tree-indent-1 .tree-item { padding-left: 28px; }
    .sidebar-tree .tree-indent-2 .tree-item { padding-left: 40px; }
    .sidebar-tree .tree-indent-3 .tree-item { padding-left: 52px; }
    .tree-icon { margin-right: 6px; font-size: 14px; flex-shrink: 0; }
    .project-content { flex: 1; overflow-y: auto; padding: 24px 40px; }
    .doc h1 { font-size: 2em; margin: 0.5em 0; border-bottom: 2px solid #e0e0e0; padding-bottom: 0.3em; }
    .doc h2 { font-size: 1.5em; margin: 1.2em 0 0.5em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
    .doc h3 { font-size: 1.25em; margin: 1em 0 0.5em; }
    .doc p { margin: 0.8em 0; }
    .doc a { color: #2563eb; }
    .doc code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .doc pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; overflow-x: auto; margin: 1em 0; }
    .doc pre code { background: none; padding: 0; }
    .doc blockquote { border-left: 4px solid #2563eb; padding: 8px 16px; margin: 1em 0; background: #f8fafc; color: #555; }
    .doc table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    .doc th, .doc td { border: 1px solid #e0e0e0; padding: 8px 12px; text-align: left; }
    .doc th { background: #f8fafc; font-weight: 600; }
    .doc tr:nth-child(even) { background: #fafafa; }
    .doc img { max-width: 100%; border-radius: 8px; }
    .doc ul, .doc ol { margin: 0.8em 0; padding-left: 2em; }
    .doc hr { border: none; border-top: 1px solid #e0e0e0; margin: 2em 0; }
    .page-loading { text-align: center; padding: 40px; color: #888; }
    @media (max-width: 768px) {
      .project-body { flex-direction: column; }
      .project-sidebar { width: 100%; max-height: 35vh; border-right: none; border-bottom: 1px solid #e0e0e0; }
      .project-content { padding: 16px; }
    }
  </style>
</head>
<body>
<div class="project-layout">
  <div class="project-toolbar">
    <a href="/pub/">&#8592; Volver</a>
    <span class="title">${projectName}</span>
    ${local ? '<span class="local-tag">LOCAL</span>' : ''}
    <button class="primary" onclick="editCurrent()">Editar</button>
  </div>
  <div class="project-body">
    <nav class="project-sidebar">
      <ul class="sidebar-tree">
        ${renderTreeHtml(tree)}
      </ul>
    </nav>
    <main class="project-content">
      <div id="doc-content" class="doc">${rendered}</div>
    </main>
  </div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script>
  const URL_PREFIX = ${JSON.stringify(urlPrefix)};
  const API_BASE = ${JSON.stringify(apiBase)};
  const ALL_PAGES = ${JSON.stringify(allPages)};
  let currentPage = ${JSON.stringify(currentFile)};

  function toggleFolder(li) {
    li.classList.toggle('collapsed');
  }

  function revealPage(page) {
    const el = document.querySelector('.tree-item[data-page="' + page + '"]');
    if (!el) return;
    let parent = el.closest('.tree-folder');
    while (parent) {
      parent.classList.remove('collapsed');
      parent = parent.parentElement.closest('.tree-folder');
    }
  }

  function setActive(page) {
    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
    revealPage(page);
    const active = document.querySelector('.tree-item[data-page="' + page + '"]');
    if (active) { active.classList.add('active'); active.scrollIntoView({ block: 'nearest' }); }
  }
  setActive(currentPage);

  async function loadPage(page) {
    const content = document.getElementById('doc-content');
    content.innerHTML = '<div class="page-loading">Cargando...</div>';
    try {
      const res = await fetch(API_BASE + '/api/project/render?folder=' + encodeURIComponent(${JSON.stringify(projectName)}) + '&page=' + encodeURIComponent(page) + (${JSON.stringify(local)} ? '&local=1' : ''));
      const data = await res.json();
      if (data.html) {
        content.innerHTML = data.html;
        currentPage = page;
        setActive(page);
        hljs.highlightAll();
        const newUrl = URL_PREFIX + ${JSON.stringify(projectName)} + '/?page=' + encodeURIComponent(page);
        history.pushState({ page }, '', newUrl);
      }
    } catch(e) {
      content.innerHTML = '<p style="color:#dc2626">Error al cargar la pagina.</p>';
    }
  }

  function editCurrent() {
    window.location.href = URL_PREFIX + currentPage + '?edit=1';
  }

  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.page) loadPage(e.state.page);
  });

  hljs.highlightAll();
</script>
</body>
</html>`;
  return html;
}
