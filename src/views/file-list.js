export function renderFileList(files, { urlPrefix = '/pub/', projectPrefix = '/pub/project/', actions = [] } = {}) {
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
      html += ` <button class="action-btn ${action.cls || ''}" onclick="${action.onclick(folder)}">${action.label}</button>`;
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
        html += ` <button class="action-btn ${action.cls || ''}" onclick="${action.onclick(doc.name)}">${action.label}</button>`;
      }
      html += `</li>`;
    }
    html += `</ul>`;
  }
  return html;
}

export function renderLocalFileList(files) {
  const byDevice = {};
  for (const f of files) {
    const parts = f.name.split('/');
    const device = parts[0];
    if (!byDevice[device]) byDevice[device] = [];
    byDevice[device].push(f);
  }

  let html = '';
  for (const [device, docs] of Object.entries(byDevice)) {
    html += `<div class="folder-name">&#128187; ${device}</div>`;
    html += `<ul class="file-list">`;

    const rootFiles = [];
    const subFolders = {};
    for (const doc of docs) {
      const parts = doc.name.split('/');
      const innerParts = parts.slice(1);
      if (innerParts.length === 1) {
        rootFiles.push(doc);
      } else {
        const folder = innerParts[0];
        if (!subFolders[folder]) subFolders[folder] = [];
        subFolders[folder].push(doc);
      }
    }

    for (const [folder, folderDocs] of Object.entries(subFolders)) {
      const latestDate = new Date(Math.max(...folderDocs.map(d => new Date(d.modified)))).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      html += `<li><a href="/pub/local/project/${device}/${folder}/" style="font-weight:600"><span class="tree-icon">&#128193;</span> ${folder}/</a><span class="meta">${folderDocs.length} docs &middot; ${latestDate}</span>`;
      html += ` <button class="action-btn publish-btn" onclick="publishLocal('${device}/${folder}')">Publicar</button>`;
      html += ` <button class="action-btn delete-btn" onclick="deleteLocal('${device}/${folder}', true)">Eliminar</button>`;
      html += `</li>`;
    }

    for (const doc of rootFiles) {
      const displayName = doc.name.split('/').pop();
      const date = new Date(doc.modified).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      html += `<li><a href="/pub/local/${doc.name}">${displayName}</a><span class="meta">${date}</span>`;
      html += ` <button class="action-btn publish-btn" onclick="publishLocal('${doc.name}')">Publicar</button>`;
      html += ` <button class="action-btn delete-btn" onclick="deleteLocal('${doc.name}')">Eliminar</button>`;
      html += `</li>`;
    }

    html += `</ul>`;
  }
  return html;
}
