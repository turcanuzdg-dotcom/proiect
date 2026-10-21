import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Fundal } from "../componente/Fundal";
import { aseazaLogouri, FinalLogouri, useLogouri } from "../componente/FinalLogouri";
import {
  evitaCuvantSingur,
  imparteEchilibrat,
  latimeEm,
  potrivesteTitlu,
  randuriText as masoaraRanduri,
} from "../componente/masuraText";
import { FinalOrbita } from "../componente/FinalOrbita";
import { TextAnimat } from "../componente/TextAnimat";
import type { ScenaFinal } from "../date/tipuri";
import {
  EASE_IESIRE,
  EASE_INTRARE_IESIRE,
  FONT_TEXT,
  FONT_TITLU,
  inaltimeRandTitlu,
  transparenta,
  useCulori,
  useFormat,
} from "../tema";

type TipContact = "web" | "email" | "telefon";

const tipContact = (s: string): TipContact =>
  s.includes("@") ? "email" : /^[+\d][\d\s().\-/]{5,}$/.test(s) ? "telefon" : "web";

/** Adresa așa cum se citește: fără „https://” și fără bara de la sfârșit. */
const curataContact = (s: string) => s.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");

const SPATIERE_CONTACT = 0.01;
const latimeContactEm = (t: string) => latimeEm(t, "textSemibold", { spatiere: SPATIERE_CONTACT });

/**
 * Contactul în capsulă, cât mai mare (până la `maxim`), fără să iasă din `latime`:
 * - pe un rând, dacă încape la cel puțin `minim`;
 * - o adresă web prea lungă se arată doar ca domeniu (calea nu se poate citi și
 *   tasta dintr-un video, iar domeniul duce oricum pe site);
 * - un e-mail sau un telefon lung trece pe două rânduri, rupt după „@”, „.”, „/”, „-”.
 */
const potrivesteContact = (text: string, tip: TipContact, latime: number, maxim: number, minim: number) => {
  const peUnRand = (t: string) => Math.min(maxim, latime / Math.max(0.001, latimeContactEm(t)));
  const m = peUnRand(text);
  if (m >= minim) return { linii: [text], marime: m };
  if (tip === "web") {
    const domeniu = text.split("/")[0];
    const md = peUnRand(domeniu);
    if (md >= minim * 0.875 || !domeniu.includes(".")) return { linii: [domeniu], marime: md };
    text = domeniu;
  }
  // cea mai echilibrată rupere în două rânduri
  let cea: { linii: string[]; lat: number } | null = null;
  for (let i = 1; i < text.length; i++) {
    if (!/[@./\-_\s]/.test(text[i - 1]) && text[i] !== "@") continue;
    const linii = [text.slice(0, i).trim(), text.slice(i).trim()];
    if (!linii[0] || !linii[1]) continue;
    const lat = Math.max(...linii.map(latimeContactEm));
    if (!cea || lat < cea.lat) cea = { linii, lat };
  }
  if (!cea) return { linii: [text], marime: m };
  return { linii: cea.linii, marime: Math.min(maxim, latime / cea.lat) };
};

/** Pictograme liniare simple, în culoarea de accent. */
const Pictograma: React.FC<{ tip: TipContact; marime: number; culoare: string }> = ({ tip, marime, culoare }) => (
  <svg
    width={marime}
    height={marime}
    viewBox="0 0 24 24"
    fill="none"
    stroke={culoare}
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    {tip === "web" ? (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="3.8" ry="9" />
        <path d="M3.4 9h17.2M3.4 15h17.2" />
      </>
    ) : tip === "email" ? (
      <>
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
        <path d="M3.8 7l8.2 6 8.2-6" />
      </>
    ) : (
      <path d="M6.7 3.5h2.4l1.5 4.1-2 1.3a11.5 11.5 0 0 0 6.5 6.5l1.3-2 4.1 1.5v2.4a2 2 0 0 1-2.1 2A16.7 16.7 0 0 1 4.7 5.6a2 2 0 0 1 2-2.1z" />
    )}
  </svg>
);

/**
 * Cartonul de final: titlul mare, centrat, care urcă din mască; o linie scurtă
 * de accent; textul de mulțumire; adresa de contact într-o capsulă conturată în
 * accent; logourile partenerilor pe o placă deschisă, apărând pe rând. În spate,
 * un inel fin desenat de o cometă, care apoi orbitează lent. Ultima jumătate de
 * secundă se stinge în culoarea fundalului (e ultima scenă a filmului).
 */
export const Final: React.FC<{ scena: ScenaFinal }> = ({ scena }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const c = useCulori();
  const f = useFormat();
  const { u, vertical } = f;

  // Ritmul de bază e gândit pentru 5 s; o scenă mai scurtă își comprimă intrarea,
  // una mai lungă o păstrează și doar ține cadrul mai mult.
  const k = Math.min(1, Math.max(0.6, durationInFrames / fps / 5));
  const t = (secunde: number) => secunde * k;
  const progres = (de: number, la: number, easing = EASE_IESIRE) =>
    interpolate(frame, [t(de) * fps, t(la) * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing,
    });
  // Mișcarea lentă și continuă din timpul menținerii (liniară pe toată scena).
  const deriva = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titluText = scena.titlu.trim();
  const text = scena.text?.trim() || null;
  const contact = scena.contact?.trim() ? curataContact(scena.contact) : null;
  const latimeUtila = f.latime - 2 * f.margineX;

  // ——— Contactul, în capsulă ———
  const tip = contact ? tipContact(contact) : "web";
  const padXCapsula = 40 * u;
  const padYCapsula = 20 * u;
  const marimePictograma = (vertical ? 40 : 38) * u;
  const spatiuPictograma = 18 * u;
  const asezareContact = contact
    ? potrivesteContact(
        contact,
        tip,
        (latimeUtila - 2 * padXCapsula - marimePictograma - spatiuPictograma) * 0.98,
        (vertical ? 42 : 40) * u,
        32 * u,
      )
    : null;
  const marimeContact = asezareContact?.marime ?? 0;
  const liniiContact = asezareContact?.linii ?? [];
  const inaltimeCapsula = liniiContact.length * marimeContact * 1.25 + 2 * padYCapsula;

  // ——— Așezarea: placa de logouri jos, restul centrat în spațiul de deasupra ———
  // Titlul trebuie să rămână de cel puțin 84u: dacă nu încape, scad întâi logourile,
  // apoi textul de mulțumire, și abia la urmă titlul.
  const datelogouri = useLogouri(scena.logouri);
  const latimeLogouri = vertical ? latimeUtila : Math.min(1500 * u, latimeUtila);
  // pe vertical, jos stau legendele și butoanele aplicațiilor (zona sigură comună)
  const josLogouri = f.margineJos;
  const sus = f.margineSus;
  const latimeText = vertical ? latimeUtila : Math.min(1180 * u, latimeUtila);
  const INALTIME_RAND_TEXT = 1.36;
  const latimeTitlu = vertical ? latimeUtila : Math.min(1440 * u, latimeUtila);
  const inaltimeRand = inaltimeRandTitlu(titluText);

  // ——— Spațieri verticale (de bază; `strans` < 1 le strânge când titlul n-ar avea loc) ———
  const grosimeLinie = Math.max(2, 3 * u);
  const spatieri = (strans: number) => ({
    linie: (vertical ? 48 : 40) * u * strans, // titlu → linia de accent
    text: (vertical ? 40 : 34) * u * strans, // linia → text
    contact: (text ? 56 : 72) * u * strans,
    logouri: (vertical ? 120 : 76) * u * strans, // conținut → placa de logouri
  });

  const calculeaza = (inaltimeLogo: number, marimeText: number, strans: number) => {
    const sp = spatieri(strans);
    const spatiuLinie = sp.linie;
    const spatiuText = sp.text;
    const spatiuContact = sp.contact;
    const logouri = datelogouri
      ? { lista: datelogouri.lista, asezare: aseazaLogouri(datelogouri.rapoarte, inaltimeLogo, latimeLogouri, u) }
      : null;
    const jos = logouri ? josLogouri + logouri.asezare.inaltime + sp.logouri : f.margineJos;
    const inaltimeZona = f.inaltime - sus - jos;
    const randuriTextul = text
      ? masoaraRanduri({ text, font: "text", marime: marimeText, latime: latimeText }).randuri
      : 0;
    const inaltimeExtra =
      (text ? spatiuLinie + grosimeLinie + spatiuText + randuriTextul * marimeText * INALTIME_RAND_TEXT : 0) +
      (contact ? spatiuContact + inaltimeCapsula : 0);

    // Titlul: cât mai mare, pe rânduri echilibrate, fără să depășească zona
    const inaltimeMaxTitlu = inaltimeZona - inaltimeExtra - 24 * u;
    const potriveste = (maxim: number) =>
      potrivesteTitlu({
        text: titluText,
        latime: latimeTitlu,
        maxim,
        minim: Math.min(84 * u, maxim),
        minimExtrem: Math.min(60 * u, maxim),
        maxRanduri: vertical ? 6 : 4,
        preferaRanduri: true,
      });
    // un titlu scurt („Mulțumim!”) poate fi mai mare; pe vertical îl limitează oricum lățimea
    let maximTitlu =
      (vertical
        ? 116
        : interpolate(titluText.length, [12, 30], [168, 128], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })) *
      u;
    let titlu = potriveste(maximTitlu);
    while (titlu.randuri * titlu.marime * inaltimeRand > inaltimeMaxTitlu && maximTitlu > 56 * u) {
      maximTitlu -= 4 * u;
      titlu = potriveste(maximTitlu);
    }
    return { logouri, jos, inaltimeZona, marimeText, randuriTextul, inaltimeExtra, titlu, sp };
  };

  const marimeTextImplicita = (text && text.length > 110 ? 40 : vertical ? 46 : 44) * u;
  const variante: [number, number, number][] = [
    [(vertical ? 90 : 76) * u, marimeTextImplicita, 1],
    [(vertical ? 78 : 66) * u, marimeTextImplicita, 1],
    [(vertical ? 66 : 56) * u, Math.min(marimeTextImplicita, 40 * u), 1],
    [(vertical ? 66 : 56) * u, Math.min(marimeTextImplicita, 40 * u), 0.65],
  ];
  let asezare = calculeaza(...variante[0]);
  for (const v of variante.slice(1)) {
    if (asezare.titlu.marime >= 84 * u - 0.5) break;
    const alta = calculeaza(...v);
    if (alta.titlu.marime > asezare.titlu.marime) asezare = alta;
  }
  const { logouri, inaltimeZona, marimeText, randuriTextul, inaltimeExtra, titlu, sp } = asezare;
  const spatiuLinie = sp.linie;
  const spatiuText = sp.text;
  const spatiuContact = sp.contact;
  const cx = f.latime / 2;
  const cy = sus + inaltimeZona / 2;

  const liniiText = text
    ? evitaCuvantSingur({
        linii: imparteEchilibrat({ text, font: "text", marime: marimeText, linii: randuriTextul }),
        font: "text",
        marime: marimeText,
        latime: latimeText,
      })
    : [];
  const liniiTitlu = evitaCuvantSingur({
    linii: imparteEchilibrat({
      text: titluText,
      font: "titlu",
      marime: titlu.marime,
      linii: titlu.randuri,
      spatiere: -0.02,
    }),
    font: "titlu",
    marime: titlu.marime,
    latime: latimeTitlu,
    spatiere: -0.02,
  });

  // Unde stă titlul, ca inelul din spate să se stingă acolo unde ar trece prin litere.
  const inaltimeTitlu = liniiTitlu.length * titlu.marime * inaltimeRand;
  const latimeTitluReala = Math.max(
    ...liniiTitlu.map(
      (l) =>
        masoaraRanduri({ text: l, font: "titlu", marime: titlu.marime, latime: Infinity, spatiere: -0.02 })
          .celMaiLatRand,
    ),
  );
  const yTitlu = cy - (inaltimeTitlu + inaltimeExtra) / 2 + inaltimeTitlu / 2;
  const mascaOrbita = `radial-gradient(ellipse ${latimeTitluReala * 0.95 + 40 * u}px ${inaltimeTitlu * 0.95 + 40 * u}px at ${cx}px ${yTitlu}px, transparent 0%, transparent 74%, black 100%)`;

  // ——— Calendarul intrării (secunde la ritmul de bază de 5 s) ———
  const nrCuvinteTitlu = titluText.split(/\s+/).filter(Boolean).length;
  const pasTitlu = nrCuvinteTitlu > 1 ? Math.min(0.08, 0.5 / (nrCuvinteTitlu - 1)) : 0;
  const startTitlu = 0.35;
  const nrCuvinteText = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const pasText = nrCuvinteText > 1 ? Math.min(0.03, 0.35 / (nrCuvinteText - 1)) : 0;
  const startText = 0.95;
  const nrLogouri = logouri ? logouri.lista.length : 0;
  const pasLogouri = nrLogouri > 1 ? Math.min(0.11, 0.4 / (nrLogouri - 1)) : 0;

  const desen = progres(0.1, 1.9, EASE_INTRARE_IESIRE);
  const linie = progres(0.85, 1.55);
  const capsula = progres(1.05, 1.8);
  const textCapsula = progres(1.2, 1.9);

  // Stingerea finală în culoarea fundalului, în ultima jumătate de secundă.
  const finalStingere = Math.max(1, durationInFrames - 1);
  const stingere = interpolate(frame, [Math.max(0, finalStingere - 0.5 * fps), finalStingere], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_INTRARE_IESIRE,
  });

  // Fiecare rând al titlului e un TextAnimat separat, ca rândurile centrate să nu
  // fie trase în stânga de spațiul de după ultimul cuvânt; cuvintele continuă
  // numărătoarea de la un rând la altul, ca dezvăluirea să curgă natural.
  let cuvinteInainte = 0;
  const randuriTitlu = liniiTitlu.map((rand, i) => {
    const start = t(startTitlu + cuvinteInainte * pasTitlu);
    cuvinteInainte += rand.split(" ").length;
    return (
      <TextAnimat
        key={i}
        text={rand}
        start={start}
        pas={t(pasTitlu)}
        durata={t(0.9)}
        style={{ justifyContent: "center" }}
      />
    );
  });

  let cuvinteText = 0;
  const randuriText = liniiText.map((rand, i) => {
    const start = t(startText + cuvinteText * pasText);
    cuvinteText += rand.split(" ").length;
    return (
      <TextAnimat
        key={i}
        text={rand}
        start={start}
        pas={t(pasText)}
        durata={t(0.8)}
        style={{ justifyContent: "center" }}
      />
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: c.fundal, overflow: "hidden" }}>
      <Fundal />

      <FinalOrbita
        cx={cx}
        cy={cy}
        raza={vertical ? 430 * u : Math.min(450 * u, cy - 36 * u)}
        desen={desen}
        secunde={frame / fps}
        deriva={deriva}
        masca={mascaOrbita}
      />

      {/* Conținutul, centrat în zona de deasupra logourilor */}
      <div
        style={{
          position: "absolute",
          left: f.margineX,
          right: f.margineX,
          top: sus,
          height: inaltimeZona,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          // apropiere lentă, ca o cameră care se mai mișcă puțin în timpul menținerii
          scale: 1 + 0.025 * deriva,
        }}
      >
        <div
          style={{
            fontFamily: FONT_TITLU,
            fontWeight: 800,
            fontSize: titlu.marime,
            lineHeight: inaltimeRand,
            letterSpacing: "-0.02em",
            color: c.text,
            width: latimeTitlu,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {randuriTitlu}
        </div>

        {text ? (
          <>
            <div
              style={{
                marginTop: spatiuLinie,
                width: 88 * u,
                height: grosimeLinie,
                borderRadius: grosimeLinie,
                backgroundColor: c.accent,
                scale: `${linie} 1`,
                opacity: Math.min(1, linie * 2),
              }}
            />
            <div
              style={{
                marginTop: spatiuText,
                fontFamily: FONT_TEXT,
                fontWeight: 500,
                fontSize: marimeText,
                lineHeight: INALTIME_RAND_TEXT,
                letterSpacing: "-0.005em",
                color: c.textSecundar,
                width: latimeText,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {randuriText}
            </div>
          </>
        ) : null}

        {contact ? (
          <div
            style={{
              marginTop: spatiuContact,
              height: inaltimeCapsula,
              maxWidth: latimeUtila,
              display: "flex",
              alignItems: "center",
              gap: spatiuPictograma,
              padding: `0 ${padXCapsula}px`,
              boxSizing: "border-box",
              borderRadius: liniiContact.length > 1 ? 40 * u : 999,
              border: `${Math.max(1.5, 2 * u)}px solid ${transparenta(c.accent, 85)}`,
              backgroundColor: transparenta(c.accent, 7),
              backdropFilter: `blur(${20 * u}px)`,
              // capsula se deschide din centru
              clipPath: `inset(-2px ${(1 - capsula) * 50}% -2px ${(1 - capsula) * 50}% round ${liniiContact.length > 1 ? 40 * u : 999}px)`,
              opacity: Math.min(1, capsula * 3),
            }}
          >
            <div
              style={{
                display: "flex",
                opacity: textCapsula,
                translate: `0 ${(1 - textCapsula) * 10 * u}px`,
              }}
            >
              <Pictograma tip={tip} marime={marimePictograma} culoare={c.accent} />
            </div>
            <div
              style={{
                fontFamily: FONT_TEXT,
                fontWeight: 600,
                fontSize: marimeContact,
                lineHeight: 1.25,
                letterSpacing: `${SPATIERE_CONTACT}em`,
                color: c.text,
                whiteSpace: "nowrap",
                textAlign: "left",
                opacity: textCapsula,
                translate: `0 ${(1 - textCapsula) * 10 * u}px`,
              }}
            >
              {liniiContact.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {logouri ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: josLogouri,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <FinalLogouri
            logouri={logouri.lista}
            asezare={logouri.asezare}
            start={t(1.3)}
            pas={t(pasLogouri)}
            durata={t(0.6)}
          />
        </div>
      ) : null}


      {/* stingerea finală */}
      <AbsoluteFill style={{ backgroundColor: c.fundal, opacity: stingere, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
