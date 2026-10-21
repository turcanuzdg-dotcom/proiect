// Foaie de verificare: câte un cadru din fiecare scenă (și din fiecare tranziție, cu
// --tranzitii), randate dintr-un singur bundle și unite într-o singură imagine.
//
//   node scripts/foaie.mjs out/proiect.json [Prezentare|PrezentareVerticala] [--scala=0.4] [--tranzitii]
//
// Rezultatul: out/foaie-<compoziție>.jpg. Deschide doar foaia, nu cadrele separate.
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { buildSync } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const argumente = process.argv.slice(2);
const optiuni = Object.fromEntries(
  argumente.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")).map(([k, v]) => [k, v ?? true]),
);
const [fisierProps, id = "Prezentare"] = argumente.filter((a) => !a.startsWith("--"));
if (!fisierProps) {
  console.error("Folosire: node scripts/foaie.mjs <proiect.json> [Prezentare|PrezentareVerticala] [--scala=0.4] [--tranzitii]");
  process.exit(1);
}
const scala = Number(optiuni.scala ?? 0.4);
const props = JSON.parse(fs.readFileSync(fisierProps, "utf8"));
const dirLucru = path.resolve("out/.foaie");
fs.mkdirSync(dirLucru, { recursive: true });

// Cronologia exactă (aceeași funcție ca în compoziție), compilată din TypeScript.
const modul = path.join(dirLucru, "cronologie.mjs");
buildSync({
  stdin: { contents: 'export { cronologie } from "./src/tranzitii/plan";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: modul,
  logLevel: "error",
});
const { cronologie } = await import(pathToFileURL(modul).href);

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), onProgress: () => {} });
const browser = await openBrowser("chrome");
const compozitie = await selectComposition({ serveUrl, id, inputProps: props, puppeteerInstance: browser, logLevel: "error" });
const { scene, tranzitii } = cronologie(props, compozitie.fps);

const cadre = scene.map((s, i) => ({
  cadru: Math.min(compozitie.durationInFrames - 1, s.start + Math.round(s.durata * 0.55)),
  eticheta: `${i + 1}. ${props.scene[i].tip}`,
}));
if (optiuni.tranzitii) {
  tranzitii.forEach((t, i) =>
    cadre.push({ cadru: t.start + Math.round(t.durataCadre / 2), eticheta: `${i + 1}→${i + 2} ${t.tip}` }),
  );
}

const imagini = [];
for (const { cadru, eticheta } of cadre) {
  const iesire = path.join(dirLucru, `${id}-${String(cadru).padStart(5, "0")}.png`);
  await renderStill({
    serveUrl, composition: compozitie, inputProps: props, frame: cadru, output: iesire, scale: scala,
    puppeteerInstance: browser, logLevel: "error", overwrite: true,
  });
  imagini.push(["-label", `${eticheta} · cadrul ${cadru}`, iesire]);
}
await browser.close({ silent: true });

const foaie = path.resolve(`out/foaie-${id}.jpg`);
const coloane = compozitie.height > compozitie.width ? 5 : 4;
execFileSync("montage", [
  ...imagini.flat(), "-tile", `${coloane}x`, "-geometry", "+4+4", "-pointsize", "14",
  "-background", "#111", "-fill", "#ddd", "-quality", "82", foaie,
]);
console.log(foaie);
