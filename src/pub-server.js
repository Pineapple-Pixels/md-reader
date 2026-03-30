import { Router } from 'express';
import { PUB_DIR, LOCAL_DIR } from './lib/config.js';
import { ensureDir, getFiles } from './lib/storage.js';
import { renderIndex } from './views/index.js';
import cloudRoutes from './routes/cloud.js';
import localRoutes from './routes/local.js';
import apiRoutes from './routes/api.js';

const router = Router();

// Index: list all documents (cloud + local)
router.get('/', async (req, res) => {
  const cloudFiles = await getFiles(PUB_DIR);
  await ensureDir(LOCAL_DIR);
  const localFiles = await getFiles(LOCAL_DIR);
  res.send(renderIndex(cloudFiles, localFiles));
});

// Mount sub-routers (local before cloud — cloud has catch-all /:name.md routes)
router.use(apiRoutes);
router.use(localRoutes);
router.use(cloudRoutes);

export default router;
