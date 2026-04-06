import { pageHead, pageFoot } from './layout.js';

export function renderLogin(error = '') {
  let html = pageHead('Login');
  html += `<div style="max-width:360px;margin:80px auto">
    <h1 style="margin-bottom:24px;font-size:1.5em">Iniciar sesion</h1>
    ${error ? `<div style="background:#fef2f2;color:#dc2626;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:14px">${error}</div>` : ''}
    <form method="POST" action="/api/auth/login">
      <label style="display:block;font-size:14px;font-weight:500;margin-bottom:4px">Usuario</label>
      <input type="text" name="user" required style="width:100%;padding:10px;border:1px solid #d0d0d0;border-radius:6px;font-size:14px;margin-bottom:14px">
      <label style="display:block;font-size:14px;font-weight:500;margin-bottom:4px">Contrasena</label>
      <input type="password" name="pass" required style="width:100%;padding:10px;border:1px solid #d0d0d0;border-radius:6px;font-size:14px;margin-bottom:20px">
      <button type="submit" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:500">Entrar</button>
    </form>
  </div>`;
  html += pageFoot();
  return html;
}
