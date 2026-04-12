/** Shared types between server and client */

export interface SearchEntry {
  file: string;
  title: string;
  content: string;
  mtime: string;
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
  teams?: TeamMembership[];
}
