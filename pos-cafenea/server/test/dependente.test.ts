import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * În producție se instalează doar dependențele (`npm ci --omit=dev`): tot ce pornește sau importă
 * serverul (și puntea) trebuie să fie în `dependencies`, nu în devDependencies de la rădăcină.
 */
const radacina = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface Manifest {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
const manifest = (dir: string): Manifest => JSON.parse(readFileSync(path.join(radacina, dir, 'package.json'), 'utf8'));
const blocare: { packages: Record<string, { version?: string; dev?: boolean }> } = JSON.parse(
  readFileSync(path.join(radacina, 'package-lock.json'), 'utf8'),
);

/** Fișierele .ts care rulează în producție (fără teste). */
function surse(dir: string): string[] {
  return readdirSync(path.join(radacina, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => path.join(radacina, dir, f));
}

/** Pachetele npm importate (fără modulele Node și importurile relative). */
function pacheteImportate(dir: string): string[] {
  const nume = new Set<string>();
  for (const f of surse(dir)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*|import\s+)'([^'.][^']*)'/g)) {
      const spec = m[1];
      if (spec.startsWith('node:')) continue;
      const parti = spec.split('/');
      nume.add(spec.startsWith('@') ? parti.slice(0, 2).join('/') : parti[0]);
    }
  }
  return [...nume].sort();
}

describe('dependențele de producție', () => {
  for (const [dir, cuSurse] of [['server', ['server/src', 'shared/src']], ['punte', ['punte/src']]] as const) {
    it(`${dir}: tot ce importă codul și ce pornește „npm start” e în dependencies`, () => {
      const m = manifest(dir);
      const dependente = Object.keys(m.dependencies ?? {});
      const importate = cuSurse.flatMap(pacheteImportate);
      expect(importate.filter((p) => !dependente.includes(p))).toEqual([]);
      // Primul cuvânt din scriptul de pornire e un executabil dintr-un pachet (tsx).
      const executabil = m.scripts!.start.split(' ')[0];
      expect(dependente).toContain(executabil);
      // Și fișierul de blocare îl instalează și fără devDependencies.
      for (const p of dependente.filter((d) => !d.startsWith('@cafenea/'))) {
        expect(blocare.packages[`node_modules/${p}`], p).toBeDefined();
        expect(blocare.packages[`node_modules/${p}`].dev, p).not.toBe(true);
      }
    });
  }

  it('shared nu importă pachete npm: serverul îl rulează direct din sursă', () => {
    expect(pacheteImportate('shared/src')).toEqual([]);
  });

  it('@fastify/static e la o versiune fără vulnerabilitățile cunoscute (≥ 10.1.2)', () => {
    const [major, minor, patch] = blocare.packages['node_modules/@fastify/static'].version!.split('.').map(Number);
    expect(major * 1e6 + minor * 1e3 + patch).toBeGreaterThanOrEqual(10_001_002);
  });
});
