import { readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export type FolderNode = {
  type: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
};

export type FileNode = {
  type: 'file';
  name: string;
  path: string;
};

export type TreeNode = FolderNode | FileNode;

export async function buildTree(dir: string, base = ''): Promise<TreeNode[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const items: TreeNode[] = [];
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

export function findMainPage(tree: TreeNode[], folderName: string): string | null {
  const indexFile = tree.find((i): i is FileNode => i.type === 'file' && i.name === 'index');
  if (indexFile) return indexFile.path;
  const namedFile = tree.find((i): i is FileNode => i.type === 'file' && i.name === folderName);
  if (namedFile) return namedFile.path;
  const firstFile = tree.find((i): i is FileNode => i.type === 'file');
  if (firstFile) return firstFile.path;
  for (const item of tree) {
    if (item.type === 'folder') {
      const found = findMainPage(item.children, folderName);
      if (found) return found;
    }
  }
  return null;
}

export function flattenTree(tree: TreeNode[]): string[] {
  const result: string[] = [];
  for (const item of tree) {
    if (item.type === 'file') result.push(item.path);
    if (item.type === 'folder') result.push(...flattenTree(item.children));
  }
  return result;
}

export function firstFileInTree(items: TreeNode[]): string | null {
  for (const item of items) {
    if (item.type === 'file') return item.path;
    if (item.type === 'folder') {
      const found = firstFileInTree(item.children);
      if (found) return found;
    }
  }
  return null;
}

function escapeAttr(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsString(s: string): string {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e');
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderTreeHtml(items: TreeNode[], depth = 0): string {
  let html = '';
  for (const item of items) {
    if (item.type === 'folder') {
      const firstFile = firstFileInTree(item.children);
      const loadAttr = firstFile ? `loadPage('${escapeAttr(escapeJsString(firstFile))}');` : '';
      html += `<li class="tree-folder tree-indent-${depth} collapsed">
        <div class="tree-item" onclick="toggleFolder(this.parentElement);${loadAttr}">
          <span class="tree-chevron">&#9654;</span><span class="tree-icon">&#128193;</span>${escapeHtml(item.name)}
        </div>
        <ul class="sidebar-tree tree-children">${renderTreeHtml(item.children, depth + 1)}</ul>
      </li>`;
    } else {
      const pathAttr = escapeAttr(item.path);
      const pathJs = escapeAttr(escapeJsString(item.path));
      html += `<li class="tree-indent-${depth}">
        <a class="tree-item" href="#" data-page="${pathAttr}" onclick="loadPage('${pathJs}');return false;">
          <span class="tree-icon">&#128196;</span>${escapeHtml(item.name)}
        </a>
      </li>`;
    }
  }
  return html;
}
