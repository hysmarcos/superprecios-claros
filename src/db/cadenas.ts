// Catálogo de cadenas. El orden importa: en Postgres el seed asigna `cadenas.id`
// (serial) en este orden, y el build estático usa la misma posición (índice + 1).
// Agregar cadenas nuevas siempre al final.
export const CADENAS_SEED = [
  { comercioId: 12, banderaId: 1, nombreDisplay: 'Coto',           grupo: 'Coto',      cuit: '30548083156', urlSitio: 'https://www.coto.com.ar/' },
  { comercioId: 9,  banderaId: 1, nombreDisplay: 'Vea',            grupo: 'Cencosud',  cuit: '30590360763', urlSitio: 'http://www.Veadigital.com.ar' },
  { comercioId: 9,  banderaId: 2, nombreDisplay: 'Disco',          grupo: 'Cencosud',  cuit: '30590360763', urlSitio: 'http://www.Discovirtual.com.ar' },
  { comercioId: 9,  banderaId: 3, nombreDisplay: 'Jumbo',          grupo: 'Cencosud',  cuit: '30590360763', urlSitio: 'http://www.Jumbo.com.ar' },
  { comercioId: 10, banderaId: 1, nombreDisplay: 'Hiper Carrefour',grupo: 'Carrefour', cuit: '30687310434', urlSitio: 'https://www.carrefour.com.ar' },
  { comercioId: 10, banderaId: 2, nombreDisplay: 'Carrefour Market',grupo:'Carrefour', cuit: '30687310434', urlSitio: 'https://www.carrefour.com.ar' },
  { comercioId: 10, banderaId: 3, nombreDisplay: 'Carrefour Express',grupo:'Carrefour',cuit: '30687310434', urlSitio: 'https://www.carrefour.com.ar' },
  { comercioId: 10, banderaId: 4, nombreDisplay: 'Carrefour Maxi', grupo: 'Carrefour', cuit: '30687310434', urlSitio: 'https://www.carrefour.com.ar' },
  { comercioId: 15, banderaId: 1, nombreDisplay: 'DIA',            grupo: 'DIA',       cuit: '30685849751', urlSitio: 'https://www.supermercadosdia.com.ar' },
  { comercioId: 2,  banderaId: 1, nombreDisplay: 'La Anónima',     grupo: 'La Anónima',cuit: '30506730038', urlSitio: 'http://www.laanonima.com.ar/' },
  { comercioId: 2,  banderaId: 2, nombreDisplay: 'Topsy',          grupo: 'La Anónima',cuit: '30506730038', urlSitio: 'http://www.laanonima.com.ar/' },
  { comercioId: 2,  banderaId: 3, nombreDisplay: 'Bomba',          grupo: 'La Anónima',cuit: '30506730038', urlSitio: 'http://www.laanonima.com.ar/' },
  { comercioId: 13, banderaId: 1, nombreDisplay: 'Cooperativa Obrera', grupo: 'Cooperativa Obrera', cuit: '30525705931', urlSitio: 'http://www.cooperativaobrera.coop' },
  { comercioId: 16, banderaId: 1, nombreDisplay: 'Hipermercado Libertad', grupo: 'Libertad', cuit: '30612929455', urlSitio: 'http://www.libertadsa.com.ar' },
  { comercioId: 21, banderaId: 1, nombreDisplay: 'Toledo',         grupo: 'Toledo',    cuit: '30551497492', urlSitio: 'http://www.supertoledo.com' },
];

export interface Cadena {
  id: number;
  comercioId: number;
  banderaId: number;
  nombreDisplay: string;
  grupo: string;
}

export const CADENAS: Cadena[] = CADENAS_SEED.map((c, i) => ({
  id: i + 1, comercioId: c.comercioId, banderaId: c.banderaId,
  nombreDisplay: c.nombreDisplay, grupo: c.grupo,
}));
