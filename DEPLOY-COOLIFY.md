# Deploy md-reader en Coolify — paso a paso

Guia end-to-end para levantar la app desde cero en Coolify: crear la DB, setear variables de entorno, correr migraciones, crear el admin y conectar DataGrip para inspeccionar.

---

## 0. Pre-requisitos

- Cuenta en Coolify con un proyecto creado
- Repo de md-reader conectado como Application en ese proyecto
- Dominio o subdominio apuntando a la app (opcional pero recomendado)

---

## 1. Crear la base de datos PostgreSQL

1. En Coolify, entrar al **proyecto** donde vive la app
2. Click en **+ New** → **Database** → **PostgreSQL**
3. Configurar:
   - **Name**: `mdreader-db`
   - **Version**: dejar la default (16 o la que ofrezca)
   - **Postgres User / Password / DB Name**: dejar los autogenerados o setearlos a gusto
4. Guardar y hacer **Deploy**
5. Esperar a que el status quede en verde (running)

### Obtener las credenciales

Una vez arriba, dentro del servicio de Postgres vas a encontrar:

- **Internal URL** (para que la app te hable por red interna de Coolify) — algo como:
  ```
  postgres://postgres:xxxxxxxx@mdreader-db:5432/postgres
  ```
- **Public URL** (para conectarte desde tu maquina con DataGrip) — algo como:
  ```
  postgres://postgres:xxxxxxxx@tu-servidor.com:5432/postgres
  ```

Para exponer la Public URL tenes que habilitar **Public Port** en la config del servicio (y abrir el puerto en el firewall del servidor).

> Guardate el user, password, nombre de DB y host — los vas a usar en varios lugares.

---

## 2. Variables de entorno de la app

Ir a **tu app md-reader** → **Environment Variables** y setear las siguientes:

### `NODE_ENV`
| | |
|---|---|
| **Valor** | `production` |

### `PORT`
| | |
|---|---|
| **Valor** | `3500` |

La app escucha en `process.env.PORT` y default a 3500. Verifica que en Coolify → **Network / Ports Exposes** este mapeado el 3500.

### `DATABASE_URL`
| | |
|---|---|
| **Valor** | La **Internal URL** del paso 1 |
| **Ejemplo** | `postgres://postgres:xxxxxxxx@mdreader-db:5432/postgres` |

### `JWT_SECRET`
| | |
|---|---|
| **Valor** | String random largo (min 64 caracteres) |
| **Generarlo** | `node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"` |

No reutilizar el de dev. No compartirlo ni commitearlo.

### `ADMIN_USER`
| | |
|---|---|
| **Valor** | El username del admin inicial (ej. `sluser`) |

### `ADMIN_PASS`
| | |
|---|---|
| **Valor** | Password fuerte que elijas |

> Solo se usa la primera vez, cuando la tabla `users` esta vacia. Despues se cambia desde el panel admin o con `npm run user:passwd`.

### `STORAGE_DIR`
| | |
|---|---|
| **Valor** | `/app/storage` |

---

## 3. Volumen persistente para storage

Sin esto, los documentos markdown se pierden en cada deploy.

1. Ir a **tu app** → **Storages** (o **Persistent Volumes**)
2. Agregar un nuevo mount:
   - **Name / Source**: `mdreader-storage`
   - **Destination Path**: `/app/storage`
3. Guardar

---

## 4. Primer deploy

1. En **tu app** → click **Deploy**
2. Esperar a que el build termine y el container quede en running
3. Verificar logs: deberia aparecer `Docs server en http://localhost:3500/`

> Si falla por `connection refused` a la DB, verifica que la Internal URL sea correcta y que ambos servicios esten en el mismo proyecto de Coolify.

---

## 5. Correr las migraciones

Las tablas (`users`, `teams`, `comments`, etc.) no existen todavia. Hay que crearlas.

1. Coolify → **tu app** → **Terminal** (o **Execute Command**)
2. Correr:
   ```bash
   npm run db:migrate
   ```
3. Salida esperada:
   ```
   [migrate] 3 migracion(es) pendientes
   [migrate] aplicando 001_users.sql...
   [migrate] OK 001_users.sql
   [migrate] aplicando 002_teams.sql...
   [migrate] OK 002_teams.sql
   [migrate] aplicando 003_comments.sql...
   [migrate] OK 003_comments.sql
   [migrate] completado
   ```

> Es idempotente: podes re-correrlo cuando quieras, solo aplica las pendientes.

---

## 6. Seed del admin

El admin se crea automaticamente al arrancar el server **si** la tabla `users` esta vacia y estan `ADMIN_USER` + `ADMIN_PASS` seteados.

Entonces:

1. Despues de correr las migraciones, **reinicia la app** (Coolify → Restart)
2. Los logs deberian mostrar:
   ```
   [seed] admin creado desde env { id: 1, username: 'sluser' }
   ```

Si ya corriste con la DB vacia antes de las migraciones, puede que no se haya creado. En ese caso:

```bash
npm run user:create
```

Te pide username, password y rol interactivo. Poner rol `admin`.

---

## 7. Probar acceso

1. Abrir `https://tu-dominio.com/login`
2. Entrar con `sluser` / la pass que pusiste en `ADMIN_PASS`
3. Ir a `/admin` — deberias ver los paneles de Usuarios y Teams

Desde ahi ya podes crear teams y usuarios desde la UI.

---

## 8. Conectar DataGrip (o cualquier cliente SQL)

Para inspeccionar la DB desde tu maquina.

### Opcion A — via Public URL de Coolify

Requiere que hayas expuesto el puerto publico en el paso 1.

1. DataGrip → **+ New** → **Data Source** → **PostgreSQL**
2. Completar:
   - **Host**: dominio/IP publica del servidor Coolify
   - **Port**: el que Coolify te asigno (suele ser distinto a 5432)
   - **Database**: el nombre de la DB (ej. `postgres`)
   - **User**: `postgres` (o el que hayas seteado)
   - **Password**: la del paso 1
3. Click **Test Connection** → debe dar OK
4. Click **OK**

### Opcion B — via SSH tunnel (mas seguro, recomendado)

Si no queres exponer la Postgres a internet:

1. DataGrip → **+ New** → **Data Source** → **PostgreSQL**
2. Tab **SSH/SSL**:
   - **Use SSH tunnel**: si
   - **SSH Host**: tu servidor de Coolify (ej. `tu-servidor.com`)
   - **SSH Port**: `22`
   - **User / Auth**: tus credenciales SSH
3. Tab **General**:
   - **Host**: `localhost` (porque el tunnel lo expone local)
   - **Port**: `5432`
   - **Database / User / Password**: los del paso 1
4. Test Connection → OK

---

## 9. Checklist final

- [ ] Postgres creada en Coolify y running
- [ ] `NODE_ENV=production`
- [ ] `PORT=3500`
- [ ] `DATABASE_URL` con la Internal URL de la Postgres
- [ ] `JWT_SECRET` generado (no el de dev)
- [ ] `ADMIN_USER` y `ADMIN_PASS` seteados
- [ ] `STORAGE_DIR=/app/storage`
- [ ] Volumen persistente montado en `/app/storage`
- [ ] App deployada y logs sin errores
- [ ] `npm run db:migrate` corrido exitoso
- [ ] Login en `/login` funcionando
- [ ] `/admin` accesible con rol admin
- [ ] DataGrip conectado (opcional pero util)

---

## Troubleshooting

**La app no conecta a la DB** → Verificar que la `DATABASE_URL` use el **nombre interno del servicio** (no `localhost` ni IP publica). Ambos servicios deben estar en el mismo proyecto de Coolify.

**No puedo loguear con el admin** → La pass de `.env` solo siembra si `users` estaba vacia. Si ya tenias un admin, la pass vieja sigue vigente. Usar `npm run user:passwd` desde el Terminal del container.

**Los documentos desaparecen despues de un deploy** → Falta el volumen persistente. Ver paso 3.

**Error `relation "users" does not exist`** → Faltan las migraciones. Correr `npm run db:migrate`.

**Error 403 al entrar a `/admin`** → Tu user no tiene rol `admin`. Entrar a la DB y verificar: `SELECT username, role FROM users;`. Si hace falta, actualizar: `UPDATE users SET role = 'admin' WHERE username = 'sluser';`.
