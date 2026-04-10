/** Shared types between server and client islands */

export interface DocMeta {
  name: string;
  path: string;
  public: boolean;
  folder?: string;
}

export interface IslandProps {
  [key: string]: unknown;
}

export interface SearchEntry {
  file: string;
  title: string;
  content: string;
  public: boolean;
  mtime: string;
}
