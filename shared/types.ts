/** Shared types between server and client */

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

export interface AuthResponse {
  authenticated: boolean;
  user?: string;
  role?: 'admin' | 'member';
  displayName?: string | null;
  teams?: TeamMembership[];
}

export interface RenderResponse {
  html: string;
  comments: Comment[];
  commentCount: number;
  canWrite?: boolean;
  canComment?: boolean;
}

export interface PullResponse {
  file: string;
  content: string;
}

export interface FileEntry {
  name: string;
  modified: string;
}

export interface AdminUser {
  id: number;
  username: string;
  displayName: string | null;
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
