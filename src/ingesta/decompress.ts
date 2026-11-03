import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../lib/logger.js';

const execFileAsync = promisify(execFile);

/**
 * Extrae un ZIP aplanando carpetas (`unzip -j`). Usa el `unzip` del sistema y no
 * yauzl: con los ZIP de SEPA (entradas grandes sin compresión), el stream de yauzl
 * se frenaba (visto con Node 24 en Windows) y el proceso terminaba con código 0,
 * sin error y con archivos a medias. `unzip` viene en los runners de GitHub.
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  try {
    await execFileAsync('unzip', ['-o', '-j', '-q', zipPath, '-d', destDir], { maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    // Código 1 = terminó bien pero con avisos (por ejemplo, rutas con "\\")
    if ((e as { code?: number }).code !== 1) throw e;
    logger.debug({ zipPath, stderr: String((e as { stderr?: string }).stderr ?? '') }, 'unzip con avisos');
  }
}

export interface InnerChainBundle {
  comercioId: number;
  banderaPrefix: number;  // sepa_1_... o sepa_2_...
  csvDir: string;          // ruta donde están comercio.csv, sucursales.csv, productos.csv
  fechaArchivo: string | null;  // YYYY-MM-DD tomado del nombre del inner ZIP
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
    const fechaArchivo = /_(\d{4}-\d{2}-\d{2})_/.exec(innerName)?.[1] ?? null;
    const innerPath = join(outerDir, innerName);
    const innerDir = join(workDir, `chain-${comercioId}`);
    try {
      await extractZip(innerPath, innerDir);
      bundles.push({ comercioId, banderaPrefix, csvDir: innerDir, fechaArchivo });
    } catch (e) {
      logger.warn({ innerName, err: String(e) }, 'inner zip extraction failed, skipping');
    }
  }
  return bundles;
}
