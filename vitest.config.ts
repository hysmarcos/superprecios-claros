import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
    pool: 'forks',
    // Tests comparten una única instancia de Postgres y manipulan las mismas
    // tablas (TRUNCATE + INSERT). Correr archivos en serie evita race conditions
    // entre TRUNCATE de un suite y los INSERT de otro.
    fileParallelism: false,
  },
});
