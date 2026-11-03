import { db } from './client.js';
import { cadenas } from './schema.js';
import { logger } from '../lib/logger.js';
import { CADENAS_SEED } from './cadenas.js';

async function seed() {
  for (const c of CADENAS_SEED) {
    await db.insert(cadenas)
      .values({ ...c, activa: true })
      .onConflictDoNothing({ target: [cadenas.comercioId, cadenas.banderaId] });
  }
  logger.info({ count: CADENAS_SEED.length }, 'cadenas seeded');
  process.exit(0);
}

seed().catch((e) => { logger.error(e); process.exit(1); });
