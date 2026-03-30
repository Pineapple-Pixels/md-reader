import express from 'express';
import pubRouter from './pub-server.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/pub', pubRouter);

app.use((err, req, res, next) => {
  console.error('ERROR:', err.message, err.stack);
  res.status(500).send('Error: ' + err.message);
});

const PORT = process.env.PORT || 3500;
app.listen(PORT, () => console.log(`Docs server en http://localhost:${PORT}/pub/`));
