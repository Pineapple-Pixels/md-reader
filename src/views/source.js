import { pageHead, pageFoot } from './layout.js';

export function renderSource(file, content, comments, { urlPrefix = '/doc/', isPublic = false } = {}) {
  const lines = content.split('\n');
  const commentsByLine = {};
  for (const c of comments) {
    if (c.line) {
      if (!commentsByLine[c.line]) commentsByLine[c.line] = [];
      commentsByLine[c.line].push(c);
    }
  }

  const homeUrl = isPublic ? '/pub/' : '/';
  let html = pageHead(`Fuente: ${file}`);
  html += `<div class="toolbar">
    <a href="${homeUrl}">Volver</a>
    <a href="${urlPrefix}${file}">Ver renderizado</a>
    ${!isPublic ? `<a href="${urlPrefix}${file}?edit=1">Editar</a>` : ''}
  </div>`;
  html += `<div class="source-view">`;
  lines.forEach((line, i) => {
    const lineNum = i + 1;
    const hasComment = commentsByLine[lineNum];
    html += `<div class="source-line${hasComment ? ' has-comment' : ''}">`;
    html += `<span class="line-num"${!isPublic ? ` onclick="toggleCommentForm(${lineNum})"` : ''}>${lineNum}</span>`;
    html += `<span class="line-content">${line.replace(/</g, '&lt;')}</span>`;
    html += `</div>`;
    if (hasComment) {
      for (const c of commentsByLine[lineNum]) {
        const date = new Date(c.date).toLocaleDateString('es-AR');
        html += `<div class="comment-box">
          ${!isPublic ? `<button class="delete-comment" onclick="deleteComment('${c.id}')">&times;</button>` : ''}
          <span class="author">${c.author}</span> <span class="date">${date}</span>
          <div class="text">${c.text.replace(/</g, '&lt;')}</div>
        </div>`;
      }
    }
    if (!isPublic) {
      html += `<div id="comment-form-${lineNum}" class="comment-form" style="display:none">
        <input type="text" id="comment-author-${lineNum}" placeholder="Tu nombre" value="Anonimo">
        <input type="text" id="comment-text-${lineNum}" placeholder="Comentario..." onkeydown="if(event.key==='Enter')addComment(${lineNum})">
        <button onclick="addComment(${lineNum})">Enviar</button>
      </div>`;
    }
  });
  html += `</div>`;

  if (!isPublic) {
    html += `<script>
    function toggleCommentForm(line) {
      const form = document.getElementById('comment-form-' + line);
      form.style.display = form.style.display === 'none' ? 'flex' : 'none';
      if (form.style.display === 'flex') document.getElementById('comment-text-' + line).focus();
    }
    async function addComment(line) {
      const text = document.getElementById('comment-text-' + line).value;
      const author = document.getElementById('comment-author-' + line).value || 'Anonimo';
      if (!text) return;
      await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: ${JSON.stringify(file)}, line, text, author })
      });
      location.reload();
    }
    async function deleteComment(id) {
      await fetch('/api/comments/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: ${JSON.stringify(file)}, id })
      });
      location.reload();
    }
    </script>`;
  }

  html += pageFoot({ private: !isPublic });
  return html;
}
