export function pageHead(title) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Docs</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; background: #fafafa; }
    .container { max-width: 860px; margin: 0 auto; padding: 20px; }
    .toolbar { display: flex; gap: 10px; padding: 12px 0; border-bottom: 1px solid #e0e0e0; margin-bottom: 24px; flex-wrap: wrap; }
    .toolbar a, .toolbar button { padding: 6px 14px; border-radius: 6px; text-decoration: none; font-size: 14px; cursor: pointer; border: 1px solid #d0d0d0; background: white; color: #333; transition: all 0.15s; }
    .toolbar a:hover, .toolbar button:hover { background: #f0f0f0; border-color: #999; }
    .toolbar .primary { background: #2563eb; color: white; border-color: #2563eb; }
    .toolbar .primary:hover { background: #1d4ed8; }
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
    .file-list { list-style: none; }
    .file-list li { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; }
    .file-list li:hover { background: #f8fafc; }
    .file-list a { text-decoration: none; color: #2563eb; font-weight: 500; }
    .file-list .meta { color: #888; font-size: 13px; margin-left: 10px; }
    .folder-name { font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin: 20px 0 8px; font-weight: 600; }
    .editor-wrap { display: flex; flex-direction: column; height: calc(100vh - 140px); }
    .editor-wrap textarea { flex: 1; width: 100%; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 14px; line-height: 1.6; padding: 16px; border: 1px solid #d0d0d0; border-radius: 8px; resize: none; outline: none; tab-size: 2; }
    .editor-wrap textarea:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    .source-view { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0; overflow-x: auto; }
    .source-line { display: flex; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; line-height: 1.7; }
    .source-line:hover { background: #f1f5f9; }
    .source-line.has-comment { background: #fef9c3; }
    .line-num { min-width: 50px; padding: 0 12px; text-align: right; color: #94a3b8; user-select: none; cursor: pointer; border-right: 1px solid #e2e8f0; }
    .line-num:hover { color: #2563eb; background: #eff6ff; }
    .line-content { padding: 0 16px; white-space: pre-wrap; word-break: break-all; flex: 1; }
    .comment-box { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px; margin: 8px 0 8px 62px; }
    .comment-box .author { font-weight: 600; font-size: 13px; }
    .comment-box .date { color: #888; font-size: 12px; }
    .comment-box .text { margin-top: 4px; font-size: 14px; }
    .comment-box .delete-comment { float: right; cursor: pointer; color: #dc2626; border: none; background: none; font-size: 12px; }
    .comment-form { margin: 8px 0 8px 62px; display: flex; gap: 8px; }
    .comment-form input { flex: 1; padding: 6px 10px; border: 1px solid #d0d0d0; border-radius: 6px; font-size: 13px; }
    .comment-form button { padding: 6px 12px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .new-doc-form { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-top: 20px; }
    .new-doc-form input { width: 100%; padding: 10px; border: 1px solid #d0d0d0; border-radius: 6px; font-size: 14px; margin-bottom: 10px; }
    .new-doc-form button { padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .section-header { display: flex; align-items: center; gap: 10px; margin-top: 20px; margin-bottom: 8px; }
    .section-badge { font-size: 13px; padding: 2px 10px; border-radius: 12px; font-weight: 600; }
    .cloud-badge { background: #dbeafe; color: #1d4ed8; }
    .local-badge { background: #fef3c7; color: #92400e; }
    .action-btn { padding: 3px 10px; border-radius: 4px; border: 1px solid #d0d0d0; background: white; font-size: 12px; cursor: pointer; margin-left: 6px; transition: all 0.15s; }
    .action-btn:hover { background: #f0f0f0; }
    .publish-btn { color: #2563eb; border-color: #93c5fd; }
    .publish-btn:hover { background: #eff6ff; }
    .download-btn { color: #059669; border-color: #6ee7b7; }
    .download-btn:hover { background: #ecfdf5; }
    .delete-btn { color: #dc2626; border-color: #fca5a5; }
    .delete-btn:hover { background: #fef2f2; }
    .upload-actions { display: flex; gap: 12px; margin: 16px 0 8px; }
    .upload-btn { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; border: 2px solid #e0e0e0; background: white; transition: all 0.15s; flex: 1; justify-content: center; }
    .upload-btn:hover { border-color: #2563eb; background: #eff6ff; }
    .upload-btn .upload-icon { font-size: 20px; }
    .file-btn:hover { border-color: #2563eb; color: #1d4ed8; }
    .folder-btn { border-color: #d6bcfa; }
    .folder-btn:hover { border-color: #7c3aed; background: #f5f3ff; color: #7c3aed; }
    .drop-zone { border: 2px dashed #d0d0d0; border-radius: 8px; padding: 16px; text-align: center; color: #888; margin: 0 0 16px; transition: all 0.2s; font-size: 13px; }
    .drop-zone.drag-over { border-color: #2563eb; background: #eff6ff; color: #2563eb; }
    .empty-msg { color: #888; font-size: 14px; padding: 16px 0; }
    .local-tag { display: inline-block; background: #fef3c7; color: #92400e; font-size: 11px; padding: 1px 8px; border-radius: 4px; margin-left: 8px; font-weight: 600; }
    .project-layout { display: flex; height: calc(100vh - 60px); }
    .project-sidebar { width: 260px; min-width: 200px; border-right: 1px solid #e0e0e0; overflow-y: auto; background: #f8fafc; padding: 12px 0; flex-shrink: 0; }
    .project-sidebar .sidebar-header { padding: 8px 16px 12px; border-bottom: 1px solid #e0e0e0; margin-bottom: 8px; }
    .project-sidebar .sidebar-header h2 { font-size: 15px; margin: 0; }
    .project-sidebar .sidebar-header a { font-size: 12px; color: #888; text-decoration: none; }
    .project-sidebar .sidebar-header a:hover { color: #2563eb; }
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
    .project-content { flex: 1; overflow-y: auto; padding: 24px 32px; max-width: 800px; }
    .project-toolbar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #e0e0e0; background: white; flex-wrap: wrap; }
    .project-toolbar a, .project-toolbar button { padding: 4px 12px; border-radius: 5px; text-decoration: none; font-size: 13px; cursor: pointer; border: 1px solid #d0d0d0; background: white; color: #555; transition: all 0.15s; }
    .project-toolbar a:hover, .project-toolbar button:hover { background: #f0f0f0; }
    .project-toolbar .primary { background: #2563eb; color: white; border-color: #2563eb; }
    @media (max-width: 768px) {
      .project-layout { flex-direction: column; height: auto; }
      .project-sidebar { width: 100%; max-height: 40vh; border-right: none; border-bottom: 1px solid #e0e0e0; }
      .project-content { padding: 16px; }
    }
    @media (max-width: 640px) {
      .container { padding: 12px; }
      .toolbar { gap: 6px; }
      .toolbar a, .toolbar button { padding: 5px 10px; font-size: 13px; }
    }
  </style>
</head>
<body>
<div class="container">`;
}

export function pageFoot() {
  return `</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script>hljs.highlightAll();</script>
</body>
</html>`;
}
