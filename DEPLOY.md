# Deploy en Coolify

## Variables de entorno requeridas

Configurar en **Coolify > tu aplicacion > Environment Variables**.

### `NODE_ENV`

| | |
|---|---|
| **Valor** | `production` |
| **Donde conseguirlo** | No se consigue, es un valor fijo |

---

### `JWT_SECRET`

Secret para firmar los tokens JWT de autenticacion.

| | |
|---|---|
| **Valor** | Un string random largo (min 64 caracteres) |
| **Donde conseguirlo** | Generalo vos con este comando: |

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

Copia el output y pegalo como valor de la variable. No lo compartas ni lo subas a git.

---

### `DATABASE_URL`

Connection string de PostgreSQL.

| | |
|---|---|
| **Formato** | `postgres://usuario:password@host:5432/nombre_db` |
| **Donde conseguirlo** | Depende de como tengas Postgres: |

**Opcion A: Postgres como servicio en Coolify**

1. En Coolify, ir a **Projects > tu proyecto > New Resource > Database > PostgreSQL**
2. Coolify genera automaticamente usuario, password y nombre de DB
3. Ir a la config del servicio de Postgres y copiar la **Internal URL** (algo como `postgres://postgres:xxxx@nombre-servicio:5432/postgres`)
4. Usar esa URL como valor de `DATABASE_URL` en la app

**Opcion B: Postgres externo (ej. Supabase, Neon, Railway)**

1. Ir al dashboard de tu proveedor
2. Buscar la seccion de **Connection String** o **Database URL**
3. Copiar la URL y usarla como valor

---

### `STORAGE_DIR` (opcional)

Directorio donde se guardan los documentos markdown.

| | |
|---|---|
| **Default** | `./storage` (relativo al working dir de la app) |
| **Donde conseguirlo** | No se consigue, es un path que vos elegis |

Solo configuralo si necesitas un path custom (ej. un volumen montado en `/data/storage`). Si no lo pones, usa `./storage`.

**Importante:** En Coolify, asegurate de tener un **volumen persistente** montado en el path que elijas, para que los documentos no se pierdan entre deploys. Configurar en **Coolify > tu app > Storages** agregando un mount (ej. source: volumen, destination: `/app/storage`).

---

### `ADMIN_USER` y `ADMIN_PASS` (opcional)

Si queres que se cree un usuario admin automaticamente en el primer arranque.

| | |
|---|---|
| **Valor** | El username y password que quieras para el admin inicial |
| **Donde conseguirlo** | Los elegis vos |

Si no los configuras, podes crear usuarios despues via CLI:
```bash
npm run user:create -- <username> <password> --role admin
```

---

## Checklist pre-deploy

- [ ] PostgreSQL corriendo y accesible desde la app
- [ ] `DATABASE_URL` configurada y testeada
- [ ] `JWT_SECRET` generado (no usar el default `change-me-in-production`)
- [ ] `NODE_ENV=production`
- [ ] Volumen persistente para `STORAGE_DIR`
- [ ] Correr migraciones: `npm run db:migrate`
