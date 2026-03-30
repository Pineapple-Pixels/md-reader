import { resolve } from 'path';
import MarkdownIt from 'markdown-it';

export const PUB_DIR = resolve(process.env.PUB_DIR || './pub-docs');
export const LOCAL_DIR = resolve(process.env.LOCAL_DIR || './pub-local');
export const PUB_TOKEN = process.env.PUB_TOKEN || '';

export const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
