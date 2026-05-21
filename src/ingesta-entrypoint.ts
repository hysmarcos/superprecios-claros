import { runIngesta } from './ingesta/index.js';
import { pool } from './db/client.js';
import { logger } from './lib/logger.js';

runIngesta()
  .then(async (runId) => {
    logger.info({ runId }, 'done');
    await pool.end();
    process.exit(0);
  })
  .catch(async (e) => {
    logger.error({ err: String(e) }, 'fatal');
    await pool.end();
    process.exit(1);
  });
