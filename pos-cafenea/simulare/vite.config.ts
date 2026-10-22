import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Simularea: serverul real (server/src) și cele două aplicații (web/src) rulează într-o singură
// pagină statică. Modulele Node se înlocuiesc cu echivalente mici (src/shim), iar accesul la baza
// de date vine din db-comun.ts (fără driverul pg și fără citire de fișiere).
const radacina = resolve(__dirname, '..');
const shim = (f: string) => resolve(__dirname, 'src/shim', f);

function serverInBrowser(): Plugin {
  const dbServer = resolve(radacina, 'server/src/db.ts');
  return {
    name: 'server-in-browser',
    enforce: 'pre',
    async resolveId(sursa, importator) {
      if (!importator || !sursa.endsWith('/db')) return null;
      const r = await this.resolve(sursa, importator, { skipSelf: true });
      return r?.id === dbServer ? resolve(radacina, 'server/src/db-comun.ts') : null;
    },
  };
}

/**
 * Pagina (pagina.html) se publică așa cum e: gazda artefactului adaugă singură <html>, <head> și <body>.
 * Cu SIMULARE_SITE=<adresa publică> devine un document complet, pentru o găzduire statică obișnuită
 * (GitHub Pages), cu previzualizarea pentru linkurile trimise pe Telegram sau Facebook.
 * Gazda artefactelor servește doar tipuri web (fără .data sau .gz), deci fișierele binare de date
 * pleacă ca text base64: arhiva demo și fișierele PostgreSQL ale PGlite (comprimate întâi).
 */
const site = process.env.SIMULARE_SITE?.replace(/\/?$/, '/');

function documentComplet(continut: string, adresa: string) {
  const descriere = 'Încercați softul de vânzare și gestiune pentru cafenea: tableta baristei, terminalul PAX și panoul administratorului, direct în browser.';
  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="Cafeneaua, simulată">
<meta property="og:description" content="${descriere}">
<meta property="og:url" content="${adresa}">
<meta property="og:image" content="${adresa}previzualizare.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>
${continut}
</body>
</html>
`;
}

function pagina(): Plugin {
  return {
    name: 'pagina-simulare',
    generateBundle(_opt, bundle) {
      const continut = readFileSync(resolve(__dirname, 'pagina.html'), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'index.html', source: site ? documentComplet(continut, site) : continut });
      if (site) {
        this.emitFile({ type: 'asset', fileName: 'previzualizare.jpg', source: readFileSync(resolve(__dirname, 'previzualizare.jpg')) });
        // Fără Jekyll: GitHub Pages ar ascunde fișierele care încep cu „_”.
        this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' });
      }
      // Sigla panoului (icon.svg, relativ la pagină).
      this.emitFile({ type: 'asset', fileName: 'icon.svg', source: readFileSync(resolve(radacina, 'web/public/icon.svg')) });
      const fs = Object.keys(bundle).find((k) => k.endsWith('.data'))!;
      const date = (bundle[fs] as { source: Uint8Array }).source;
      delete bundle[fs];
      this.emitFile({ type: 'asset', fileName: 'assets/pglite-fs.txt', source: gzipSync(date, { level: 9 }).toString('base64') });
      this.emitFile({ type: 'asset', fileName: 'assets/date-demo.txt', source: readFileSync(resolve(__dirname, 'public/date-demo.tar.gz')).toString('base64') });
    },
  };
}

export default defineConfig({
  root: __dirname,
  base: './',
  publicDir: false,
  plugins: [serverInBrowser(), react(), pagina()],
  resolve: {
    alias: {
      'node:crypto': shim('crypto.ts'),
      'node:util': shim('util.ts'),
      'node:events': shim('events.ts'),
      'pglite-dist': resolve(radacina, 'node_modules/@electric-sql/pglite/dist'),
    },
  },
  build: {
    outDir: site ? 'dist-site' : 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    modulePreload: false,
    rollupOptions: {
      input: {
        coaja: resolve(__dirname, 'src/coaja/main.tsx'),
        pos: resolve(__dirname, 'src/aplicatii/pos.tsx'),
        admin: resolve(__dirname, 'src/aplicatii/admin.tsx'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
