import { readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function buildTree(dir, base = '') {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const children = await buildTree(join(dir, entry.name), rel);
      if (children.length > 0) {
        items.push({ type: 'folder', name: entry.name, path: rel, children });
      }
    } else if (entry.name.endsWith('.md')) {
      items.push({ type: 'file', name: entry.name.replace(/\.md$/, ''), path: rel });
    }
  }
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return items;
}

export function findMainPage(tree, folderName) {
  const indexFile = tree.find(i => i.type === 'file' && i.name === 'index');
  if (indexFile) return indexFile.path;
  const namedFile = tree.find(i => i.type === 'file' && i.name === folderName);
  if (namedFile) return namedFile.path;
  const firstFile = tree.find(i => i.type === 'file');
  if (firstFile) return firstFile.path;
  for (const item of tree) {
    if (item.type === 'folder') {
      const found = findMainPage(item.children, folderName);
      if (found) return found;
    }
  }
  return null;
}

export function flattenTree(tree) {
  const result = [];
  for (const item of tree) {
    if (item.type === 'file') result.push(item.path);
    if (item.type === 'folder') result.push(...flattenTree(item.children));
  }
  return result;
}

export function firstFileInTree(items) {
  for (const item of items) {
    if (item.type === 'file') return item.path;
    if (item.type === 'folder') {
      const found = firstFileInTree(item.children);
      if (found) return found;
    }
  }
  return null;
}

export function renderTreeHtml(items, depth = 0) {
  let html = '';
  for (const item of items) {
    if (item.type === 'folder') {
      const firstFile = firstFileInTree(item.children);
      const loadAttr = firstFile ? `loadPage('${firstFile}');` : '';
      html += `<li class="tree-folder tree-indent-${depth} collapsed">
        <div class="tree-item" onclick="toggleFolder(this.parentElement);${loadAttr}">
          <span class="tree-chevron">&#9654;</span><span class="tree-icon">&#128193;</span>${item.name}
        </div>
        <ul class="sidebar-tree tree-children">${renderTreeHtml(item.children, depth + 1)}</ul>
      </li>`;
    } else {
      html += `<li class="tree-indent-${depth}">
        <a class="tree-item" href="#" data-page="${item.path}" onclick="loadPage('${item.path}');return false;">
          <span class="tree-icon">&#128196;</span>${item.name}
        </a>
      </li>`;
    }
  }
  return html;
}
