/**
 * Turns MDX into Markdown + HTML that markdown-it can render without running any code.
 * Removed lines are blanked, never dropped, so line numbers (comments) stay aligned.
 */
export function mdxToMarkdown(src: string): string {
  const lines = src.split('\n');
  let fence: string | null = null;
  let esmDepth = -1;
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;

    if (!inComment) {
      const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (fenceMatch) {
        const marker = fenceMatch[1]!;
        if (fence === null) fence = marker[0]!.repeat(marker.length);
        else if (marker.startsWith(fence)) fence = null;
        continue;
      }
      if (fence !== null) continue;

      if (esmDepth < 0 && /^(import|export)\s/.test(line)) esmDepth = 0;
      if (esmDepth >= 0) {
        esmDepth += braceDelta(line);
        lines[i] = '';
        if (esmDepth <= 0) esmDepth = -1;
        continue;
      }
    }

    // JSX comments {/* ... */}, possibly spanning lines.
    let out = '';
    while (line) {
      if (inComment) {
        const end = line.indexOf('*/}');
        if (end < 0) break;
        line = line.slice(end + 3);
        inComment = false;
      } else {
        const start = line.indexOf('{/*');
        if (start < 0) { out += line; break; }
        out += line.slice(0, start);
        line = line.slice(start + 3);
        inComment = true;
      }
    }
    lines[i] = out.replace(/\bclassName=/g, 'class=');
  }
  return lines.join('\n');
}

function braceDelta(line: string): number {
  let d = 0;
  for (const ch of line) {
    if (ch === '{' || ch === '(') d++;
    else if (ch === '}' || ch === ')') d--;
  }
  return d;
}
