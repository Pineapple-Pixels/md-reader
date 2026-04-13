import { sql } from './db.js';

export interface Comment {
  id: string;
  line: number | null;
  text: string;
  author: string;
  authorId: number | null;
  createdAt: string;
}

/** Row shape returned by postgres.js */
interface CommentRow {
  id: string;
  line: number | null;
  text: string;
  author: string;
  author_id: number | null;
  created_at: Date;
}

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    line: row.line,
    text: row.text,
    author: row.author,
    authorId: row.author_id,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getComments(scopeId: string, file: string, opts?: { limit?: number; offset?: number }): Promise<{ data: Comment[]; total: number }> {
  const countRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM comments
    WHERE scope_id = ${scopeId} AND file = ${file}
  `;
  const total = Number(countRows[0]?.count ?? '0');
  const limit = opts?.limit ?? total;
  const offset = opts?.offset ?? 0;
  const rows = await sql<CommentRow[]>`
    SELECT id, line, text, author, author_id, created_at
    FROM comments
    WHERE scope_id = ${scopeId} AND file = ${file}
    ORDER BY created_at ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return { data: rows.map(rowToComment), total };
}

export async function getCommentCount(scopeId: string, file: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM comments
    WHERE scope_id = ${scopeId} AND file = ${file}
  `;
  return parseInt(rows[0]?.count ?? '0', 10);
}

export async function addComment(
  scopeId: string,
  file: string,
  comment: { line: number | null; text: string; author: string; authorId: number | null },
): Promise<Comment> {
  const rows = await sql<CommentRow[]>`
    INSERT INTO comments (scope_id, file, line, text, author, author_id)
    VALUES (${scopeId}, ${file}, ${comment.line}, ${comment.text}, ${comment.author}, ${comment.authorId})
    RETURNING id, line, text, author, author_id, created_at
  `;
  return rowToComment(rows[0]!);
}

export async function deleteComment(scopeId: string, file: string, id: string): Promise<void> {
  await sql`
    DELETE FROM comments
    WHERE id = ${id} AND scope_id = ${scopeId} AND file = ${file}
  `;
}

export async function deleteAllComments(scopeId: string, file: string): Promise<void> {
  await sql`
    DELETE FROM comments WHERE scope_id = ${scopeId} AND file = ${file}
  `;
}
