/** Shared types between server and client */

import type { DocKind } from './doc-types.js';

export interface Paginated<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchEntry {
  file: string;
  title: string;
  content: string;
  mtime: string;
}

export interface Comment {
  id: string;
  line: number | null;
  text: string;
  author: string;
  authorId: number | null;
  createdAt: string;
}

export interface TeamMembership {
  slug: string;
  name: string;
  role: 'admin' | 'member';
}

export interface OrgMembership {
  slug: string;
  name: string;
  role: 'admin' | 'member';
}

export interface AuthResponse {
  authenticated: boolean;
  user?: string;
  /** Role in the current organization; null when the account belongs to none. */
  role?: 'admin' | 'member' | null;
  displayName?: string | null;
  org?: OrgMembership | null;
  orgs?: OrgMembership[];
  teams?: TeamMembership[];
  /** Only when unauthenticated: whether "Continuar con Google" is available. */
  google?: boolean;
}

export interface DocOrigin {
  fromLabel: string;
  fromPath: string;
  /** Username of who copied it; null when that account no longer exists. */
  by: string | null;
  at: string;
}

export interface RenderResponse {
  kind: DocKind;
  /** Empty for HTML documents, which are shown through the sandboxed frame endpoint. */
  html: string;
  comments: Comment[];
  commentCount: number;
  canWrite?: boolean;
  canComment?: boolean;
  origin?: DocOrigin | null;
}

export interface PullResponse {
  file: string;
  content: string;
  /** sha256 of `content`; sent back as `baseHash` when saving. */
  hash: string;
}

export interface VersionEntry {
  id: string;
  savedAt: string;
  size: number;
}

export interface FileEntry {
  name: string;
  modified: string;
}

export interface AdminUser {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  role: 'admin' | 'member';
  createdAt: string;
}

export interface AdminTeam {
  id: number;
  slug: string;
  name: string;
  createdAt: string;
}

export interface AdminMember {
  username: string;
  displayName: string | null;
  role: 'admin' | 'member';
}
