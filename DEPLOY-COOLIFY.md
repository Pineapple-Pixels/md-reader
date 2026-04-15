# Deploy md-reader en Coolify — paso a paso

Guia end-to-end para levantar la app desde cero en Coolify. Todo lo que sea codigo o valor esta listo para copiar y pegar.

> **Ojo:** Este archivo contiene credenciales reales. No lo subas a un repo publico.

---

## Estado actual

- [x] PostgreSQL creada en Coolify (`mdreader-db`, running/healthy)
- [ ] Variables de entorno configuradas en la app
- [ ] Volumen persistente montado
- [ ] App deployada
- [ ] Migraciones corridas
- [ ] Admin creado

---

## 1. Variables de entorno de la app

Ir a **tu app md-reader → Environment Variables** y pegar esto (un bloque por variable):

### `NODE_ENV`
```
production
```

### `PORT`
```
3500
```

### `DATABASE_URL`
```
postgres://mdreader:qPrkJEKH1UjOi258u95Zh2xJIqFKPozwoJEC5JD8YN28rcXUSmwCL69oWJR9wJId@mdreader-db:5432/mdreader
```

### `JWT_SECRET`

Generar corriendo esto en cualquier terminal:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

Copiar el output y pegarlo como valor. No reutilizar el de dev.

### `ADMIN_USER`
```
sluser
```
(o el username que prefieras para el admin inicial)

### `ADMIN_PASS`

Elegir una password fuerte. Solo se usa la primera vez que la tabla `users` esta vacia.

### `STORAGE_DIR`
```
/app/storage
```

---

## 2. Volumen persistente para storage

Sin esto los documentos markdown se pierden en cada deploy.

1. **tu app → Storages** (o Persistent Volumes)
2. Agregar mount:
   - **Source**: `mdreader-storage`
   - **Destination Path**: `/app/storage`
3. Guardar

---

## 3. Primer deploy

1. **tu app → Deploy**
2. Esperar a que el build termine y el container quede running
3. Verificar logs — debe aparecer:
   ```
   Docs server en http://localhost:3500/
   ```

> Si falla con `connection refused` a la DB: verificar que ambos servicios esten en el mismo proyecto de Coolify y que `DATABASE_URL` use `mdreader-db` como host (no `localhost` ni IP publica).

---

## 4. Correr las migraciones

**tu app → Terminal** y ejecutar:

```bash
npm run db:migrate
```

Salida esperada:
```
[migrate] 3 migracion(es) pendientes
[migrate] aplicando 001_users.sql... OK
[migrate] aplicando 002_teams.sql... OK
[migrate] aplicando 003_comments.sql... OK
[migrate] completado
```

Es idempotente — podes re-correrlo cuando quieras.

---

## 5. Crear el admin

El admin se crea automaticamente al arrancar si la tabla `users` esta vacia y estan `ADMIN_USER` + `ADMIN_PASS` seteados.

Despues de correr las migraciones: **Coolify → Restart** la app.

Los logs deben mostrar:
```
[seed] admin creado desde env { id: 1, username: 'sluser' }
```

Si no aparece (ej. ya habia datos), crear manualmente desde el Terminal:

```bash
npm run user:create
```

Ingresar username, password y rol `admin` cuando lo pida.

---

## 6. Probar acceso

1. Abrir `https://md-reader.pineapple-pixels.com/login`
2. Entrar con el usuario y password de `ADMIN_USER` / `ADMIN_PASS`
3. Ir a `/admin` — deben verse los paneles de Usuarios y Teams

---

## 7. Conectar DataGrip

### Opcion A — Public URL (puerto expuesto)

La DB tiene el proxy publico habilitado en puerto **5432**.

| Campo | Valor |
|---|---|
| Host | `md-reader.pineapple-pixels.com` |
| Port | `5432` |
| Database | `mdreader` |
| User | `mdreader` |
| Password | `qPrkJEKH1UjOi258u95Zh2xJIqFKPozwoJEC5JD8YN28rcXUSmwCL69oWJR9wJId` |

### Opcion B — SSH tunnel (recomendado si no queres exponer el puerto)

**Tab SSH/SSL:**
| Campo | Valor |
|---|---|
| Use SSH tunnel | Si |
| SSH Host | `md-reader.pineapple-pixels.com` |
| SSH Port | `22` |
| User / Auth | tus credenciales SSH del servidor |

**Tab General:**
| Campo | Valor |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `mdreader` |
| User | `mdreader` |
| Password | `qPrkJEKH1UjOi258u95Zh2xJIqFKPozwoJEC5JD8YN28rcXUSmwCL69oWJR9wJId` |

---

## Checklist final

- [ ] `NODE_ENV=production`
- [ ] `PORT=3500`
- [ ] `DATABASE_URL` con la internal URL de mdreader-db
- [ ] `JWT_SECRET` generado (no el de dev)
- [ ] `ADMIN_USER` y `ADMIN_PASS` seteados
- [ ] `STORAGE_DIR=/app/storage`
- [ ] Volumen persistente montado en `/app/storage`
- [ ] App deployada y logs sin errores
- [ ] `npm run db:migrate` corrido exitoso
- [ ] Login en `/login` funcionando
- [ ] `/admin` accesible con rol admin

---

## Troubleshooting

**La app no conecta a la DB** → Verificar que `DATABASE_URL` use `mdreader-db` como host. Ambos servicios deben estar en el mismo proyecto de Coolify.

**No puedo loguear con el admin** → La pass de env solo siembra si `users` estaba vacia. Si ya habia un admin, usar `npm run user:passwd` desde el Terminal del container.

**Los documentos desaparecen despues de un deploy** → Falta el volumen persistente. Ver paso 2.

**Error `relation "users" does not exist`** → Faltan las migraciones. Correr `npm run db:migrate`.

**Error 403 al entrar a `/admin`** → El user no tiene rol `admin`. Verificar y corregir desde el Terminal:

```sql
SELECT username, role FROM users;
UPDATE users SET role = 'admin' WHERE username = 'sluser';
```
