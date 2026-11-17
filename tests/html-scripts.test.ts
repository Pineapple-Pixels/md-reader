import { describe, it, expect } from 'vitest';
import { findHtmlScript } from '../src/lib/html-scripts.js';

describe('findHtmlScript', () => {
  it.each([
    ['<p>hola</p><script>alert(1)</script>', 'etiqueta <script>'],
    ['<SCRIPT src="https://x.test/a.js"></SCRIPT>', 'etiqueta <script>'],
    ['<script\n>1</script>', 'etiqueta <script>'],
    ['<button onclick="go()">ir</button>', 'atributo onclick'],
    ['<body ONLOAD = "x()">', 'atributo onload'],
    ['<img src=x/onerror=alert(1)>', 'atributo onerror'],
    ['<a href="JavaScript :alert(1)">x</a>', 'enlace javascript:'],
    ['<iframe src=javascript:alert(1)></iframe>', 'enlace javascript:'],
  ])('should report %s', (html, reason) => {
    expect(findHtmlScript(html)).toBe(reason);
  });

  it.each([
    '<!doctype html><html><head><style>h1{color:red}</style></head><body><h1>Hola</h1></body></html>',
    '<p>Un enlace javascript: no es un tag</p>',
    '<p>onda</p><p data-on="x">once</p>',
    '<a href="https://ejemplo.com/noscript">x</a><noscript>sin js</noscript>',
    '<p>Usa onclick= en tus botones</p>',
  ])('should accept %s', (html) => {
    expect(findHtmlScript(html)).toBeNull();
  });
});
