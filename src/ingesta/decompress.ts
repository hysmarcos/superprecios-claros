import { createReadStream, createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, basename } from 'node:path';
import { readdir } from 'node:fs/promises';
import yauzl from 'yauzl';
import { logger } from '../lib/logger.js';

function extractZip(zipPath: string, destDir: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    const extracted: string[] = [];
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      zip.readEntry();
      zip.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zip.readEntry();
          return;
        }
        const outPath = join(destDir, basename(entry.fileName));
        zip.openReadStream(entry, (err2, readStream) => {
          if (err2) return reject(err2);
          pipeline(readStream, createWriteStream(outPath))
            .then(() => { extracted.push(outPath); zip.readEntry(); })
            .catch(reject);
        });
      });
      zip.on('end', () => resolve(extracted));
      zip.on('error', reject);
    });
  });
}

export interface InnerChainBundle {
  comercioId: number;
  banderaPrefix: number;  // sepa_1_... o sepa_2_...
  csvDir: string;          // ruta donde están comercio.csv, sucursales.csv, productos.csv
}

/**
 * Descomprime el ZIP diario en 2 niveles:
 * outer ZIP → carpeta con N inner ZIPs → cada inner se descomprime en su propia carpeta.
 */
export async function decompressDailyZip(zipPath: string, workDir: string): Promise<InnerChainBundle[]> {
  const outerDir = join(workDir, 'outer');
  await extractZip(zipPath, outerDir);
  const innerZips = (await readdir(outerDir)).filter((f) => f.endsWith('.zip'));
  logger.info({ count: innerZips.length }, 'inner ZIPs found');

  const bundles: InnerChainBundle[] = [];
  for (const innerName of innerZips) {
    // formato: sepa_<prefix>_comercio-sepa-<comercioId>_<fecha>.zip
    const match = /^sepa_(\d+)_comercio-sepa-(\d+)_/.exec(innerName);
    if (!match) { logger.warn({ innerName }, 'inner zip name no match'); continue; }
    const banderaPrefix = Number(match[1]);
    const comercioId = Number(match[2]);
    const innerPath = join(outerDir, innerName);
    const innerDir = join(workDir, `chain-${comercioId}`);
    try {
      await extractZip(innerPath, innerDir);
      bundles.push({ comercioId, banderaPrefix, csvDir: innerDir });
    } catch (e) {
      logger.warn({ innerName, err: String(e) }, 'inner zip extraction failed, skipping');
    }
  }
  return bundles;
}
