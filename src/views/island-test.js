import { pageHead, pageFoot, island } from './layout.js';

export function renderIslandTest() {
  return `${pageHead('Island Test')}
  <div class="toolbar">
    <a href="/">← Dashboard</a>
  </div>
  <h1 style="font-size:1.5em;margin-bottom:16px">React Islands — Test Page</h1>
  <p style="color:#666;margin-bottom:16px">Si ves un componente interactivo abajo, la infraestructura de islas funciona correctamente.</p>

  ${island('hello', { name: 'mundo' })}

  <p style="color:#888;font-size:13px;margin-top:24px">Esta página es temporal y se puede eliminar después de verificar.</p>
${pageFoot({ private: true })}`;
}
