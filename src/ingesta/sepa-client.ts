import { createWriteStream, mkdirSync, existsSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

const RESOURCE_IDS: Record<number, string> = {
  0: 'f8e75128-515a-436e-bf8d-5c63a62f2005',  // domingo
  1: '0a9069a9-06e8-4f98-874d-da5578693290',  // lunes
  2: '9dc06241-cc83-44f4-8e25-c9b1636b8bc8',  // martes
  3: '1e92cd42-4f94-4071-a165-62c4cb2ce23c',  // miercoles
  4: 'd076720f-a7f0-4af8-b1d6-1b99d5a90c14',  // jueves
  5: '91bc072a-4726-44a1-85ec-4a8467aad27e',  // viernes
  6: 'b3c3da5d-213d-41e7-8d74-f23fda0a3c30',  // sabado
};

const FILENAMES: Record<number, string> = {
  0: 'sepa_domingo.zip', 1: 'sepa_lunes.zip', 2: 'sepa_martes.zip',
  3: 'sepa_miercoles.zip', 4: 'sepa_jueves.zip', 5: 'sepa_viernes.zip',
  6: 'sepa_sabado.zip',
};

export interface SepaDownloadResult {
  path: string;
  sizeBytes: number;
  dayOfWeek: number;
}

export async function downloadDailySepaZip(now: Date = new Date()): Promise<SepaDownloadResult> {
  const dow = now.getDay();
  const resourceId = RESOURCE_IDS[dow]!;
  const filename = FILENAMES[dow]!;
  const url = `${env.SEPA_BASE_URL}/${resourceId}/download/${filename}`;

  if (!existsSync(env.INGESTA_TMP_DIR)) mkdirSync(env.INGESTA_TMP_DIR, { recursive: true });
  const dest = join(env.INGESTA_TMP_DIR, filename);

  logger.info({ url, dest }, 'downloading SEPA ZIP');
  // datos.produccion.gob.ar está detrás de CloudFront. WAF/Bot Control puede
  // rechazar requests con headers minimalistas (Node fetch sin browser headers
  // → 403 desde Railway). Set completo de headers de Chrome reciente.
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'identity',
      'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
  });
  if (!res.ok) {
    // Capturar primeros bytes de body para diagnosticar (CloudFront muestra error en HTML)
    let bodySnippet = '';
    try { bodySnippet = (await res.text()).slice(0, 500); } catch {}
    logger.error({ status: res.status, statusText: res.statusText, bodySnippet, responseHeaders: Object.fromEntries(res.headers) }, 'SEPA fetch error response');
    throw new Error(`SEPA download failed: ${res.status} ${res.statusText}`);
  }
  if (!res.body) throw new Error('SEPA response has no body');

  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(dest));
  const sizeBytes = statSync(dest).size;
  logger.info({ sizeBytes, dest }, 'SEPA ZIP downloaded');
  return { path: dest, sizeBytes, dayOfWeek: dow };
}
