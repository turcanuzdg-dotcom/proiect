import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { staticFile } from "remotion";
import type { Proiect, Scena } from "./tipuri";

/*
 * Verificarea proiectului înainte de randare (din calculateMetadata, în Root.tsx).
 * O greșeală în date oprește randarea cu un mesaj clar, în loc să dispară ceva în
 * tăcere (o etapă în plus, o fotografie negăsită după minute de randare).
 */

const LIMITE = { cifre: [1, 4], etape: [2, 5] } as const;
const TIPURI = new Set(["intro", "foto", "inainte-dupa", "cifre", "etape", "final"]);

const esteUrl = (cale: string) => /^https?:\/\//i.test(cale);
const areText = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/** Lista problemelor din date (goală dacă proiectul e în regulă). */
export const problemeProiect = (p: Proiect): string[] => {
  const erori: string[] = [];
  if (!Array.isArray(p.scene) || p.scene.length === 0) {
    return ["Proiectul nu are nicio scenă: „scene” trebuie să fie o listă cu cel puțin o scenă."];
  }
  p.scene.forEach((s, i) => {
    const nume = `Scena ${i + 1} (${(s as { tip?: unknown }).tip ?? "fără tip"})`;
    if (!TIPURI.has(s.tip)) {
      erori.push(`${nume}: tip necunoscut; tipurile sunt ${[...TIPURI].join(", ")}.`);
      return;
    }
    if (s.durata !== undefined && !(typeof s.durata === "number" && Number.isFinite(s.durata) && s.durata > 0)) {
      erori.push(`${nume}: „durata” trebuie să fie un număr pozitiv de secunde, primit ${JSON.stringify(s.durata)}.`);
    }
    switch (s.tip) {
      case "intro":
      case "final":
        if (!areText(s.titlu)) erori.push(`${nume}: lipsește „titlu”.`);
        break;
      case "foto":
        if (!areText(s.imagine)) erori.push(`${nume}: lipsește „imagine”.`);
        break;
      case "inainte-dupa":
        if (!areText(s.inainte)) erori.push(`${nume}: lipsește „inainte”.`);
        if (!areText(s.dupa)) erori.push(`${nume}: lipsește „dupa”.`);
        break;
      case "cifre": {
        const [min, max] = LIMITE.cifre;
        const n = Array.isArray(s.cifre) ? s.cifre.length : 0;
        if (n < min || n > max) erori.push(`${nume}: între ${min} și ${max} cifre, primit ${n}.`);
        (s.cifre ?? []).forEach((c, j) => {
          if (typeof c.valoare !== "number" || !Number.isFinite(c.valoare))
            erori.push(`${nume}, cifra ${j + 1}: „valoare” trebuie să fie un număr, primit ${JSON.stringify(c.valoare)}.`);
          if (!areText(c.eticheta)) erori.push(`${nume}, cifra ${j + 1}: lipsește „eticheta”.`);
        });
        break;
      }
      case "etape": {
        const [min, max] = LIMITE.etape;
        const n = Array.isArray(s.etape) ? s.etape.length : 0;
        if (n < min || n > max) erori.push(`${nume}: între ${min} și ${max} etape, primit ${n}.`);
        (s.etape ?? []).forEach((e, j) => {
          if (!areText(e.text)) erori.push(`${nume}, etapa ${j + 1}: lipsește „text”.`);
        });
        break;
      }
    }
  });
  return erori;
};

const exista = async (cale: string) => {
  try {
    const r = await fetch(staticFile(cale), { method: "HEAD", cache: "no-store" });
    return r.ok || r.status === 405;
  } catch {
    return false;
  }
};

/**
 * Calea sub care fișierul există cu adevărat în public/. Numele cu diacritice pot fi
 * scrise pe disc descompus (NFD, de obicei fișierele venite de pe macOS) și în JSON
 * compus (NFC), sau invers: încercăm ambele forme. URL-urile rămân neschimbate.
 */
const gasesteFisier = async (cale: string): Promise<string | null> => {
  if (esteUrl(cale)) return cale;
  const variante = [...new Set([cale, cale.normalize("NFC"), cale.normalize("NFD")])];
  for (const v of variante) {
    if (await exista(v)) return v;
  }
  return null;
};

/** Pregătește proiectul: verifică datele, găsește fișierele și citește durata muzicii. */
export const pregatesteProiect = async (p: Proiect): Promise<Proiect> => {
  const erori = problemeProiect(p);
  // pe un singur rând: linia de comandă a Remotion afișează doar primul rând al erorii
  if (erori.length > 0) throw new Error(`Datele proiectului au probleme: ${erori.join(" | ")}`);

  const lipsa: string[] = [];
  const rezolva = async (cale: string, unde: string) => {
    const gasit = await gasesteFisier(cale.trim());
    if (gasit === null) lipsa.push(`${unde}: „${cale}” (căutat în public/${cale.trim()})`);
    return gasit ?? cale;
  };

  const scene: Scena[] = await Promise.all(
    p.scene.map(async (s, i): Promise<Scena> => {
      const unde = (camp: string) => `Scena ${i + 1} (${s.tip}), ${camp}`;
      switch (s.tip) {
        case "intro":
          return s.imagine?.trim() ? { ...s, imagine: await rezolva(s.imagine, unde("imagine")) } : s;
        case "foto":
          return { ...s, imagine: await rezolva(s.imagine, unde("imagine")) };
        case "inainte-dupa":
          return {
            ...s,
            inainte: await rezolva(s.inainte, unde("inainte")),
            dupa: await rezolva(s.dupa, unde("dupa")),
          };
        case "final":
          return s.logouri
            ? {
                ...s,
                logouri: await Promise.all(
                  s.logouri.map((l, j) => (l.trim() ? rezolva(l, unde(`logo ${j + 1}`)) : Promise.resolve(l))),
                ),
              }
            : s;
        default:
          return s;
      }
    }),
  );

  const muzica = p.muzica?.trim() ? await rezolva(p.muzica, "muzica") : undefined;
  if (lipsa.length > 0) {
    throw new Error(
      `Nu găsesc aceste fișiere în video/public/: ${lipsa.join(" | ")}. Folosiți nume simple, fără diacritice sau spații (de ex. media/01-santier.jpg).`,
    );
  }

  // Lungimea pistei: o melodie mai scurtă decât filmul se stinge înainte să se termine.
  let durataMuzica: number | null = null;
  if (muzica) {
    try {
      const d = await getAudioDurationInSeconds(esteUrl(muzica) ? muzica : staticFile(muzica));
      durataMuzica = Number.isFinite(d) && d > 0 ? d : null;
    } catch {
      durataMuzica = null;
    }
  }

  return { ...p, scene, muzica, durataMuzica };
};
