export function renderFileList(files, { urlPrefix = '/pub/', projectPrefix = '/pub/project/', actions = [], meta = {} } = {}) {
  const rootFiles = files.filter(f => !f.name.includes('/'));
  const folders = {};
  for (const f of files) {
    if (!f.name.includes('/')) continue;
    const topFolder = f.name.split('/')[0];
    if (!folders[topFolder]) folders[topFolder] = [];
    folders[topFolder].push(f);
  }

  let html = '';

  for (const [folder, docs] of Object.entries(folders)) {
    const latestDate = new Date(Math.max(...docs.map(d => new Date(d.modified)))).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    html += `<ul class="file-list">`;
    html += `<li><a href="${projectPrefix}${folder}/" style="font-weight:600"><span class="tree-icon">&#128193;</span> ${folder}/</a><span class="meta">${docs.length} docs &middot; ${latestDate}</span>`;
    for (const action of actions) {
      const label = typeof action.label === 'function' ? action.label(folder) : action.label;
      const cls = typeof action.cls === 'function' ? action.cls(folder) : action.cls;
      html += ` <button class="action-btn ${cls || ''}" onclick="${action.onclick(folder)}">${label}</button>`;
    }
    html += `</li></ul>`;
  }

  if (rootFiles.length) {
    html += `<ul class="file-list">`;
    for (const doc of rootFiles) {
      const displayName = doc.name.split('/').pop();
      const date = new Date(doc.modified).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      html += `<li><a href="${urlPrefix}${doc.name}">${displayName}</a><span class="meta">${date}</span>`;
      for (const action of actions) {
        const label = typeof action.label === 'function' ? action.label(doc.name) : action.label;
        const cls = typeof action.cls === 'function' ? action.cls(doc.name) : action.cls;
        html += ` <button class="action-btn ${cls || ''}" onclick="${action.onclick(doc.name)}">${label}</button>`;
      }
      html += `</li>`;
    }
    html += `</ul>`;
  }
  return html;
}
