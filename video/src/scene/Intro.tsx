import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Fundal } from "../componente/Fundal";
import { ImagineMiscare } from "../componente/ImagineMiscare";
import { incapePeRand, latimeEchilibrata, potrivesteTitlu } from "../componente/masuraText";
import { TextAnimat } from "../componente/TextAnimat";
import type { ScenaIntro } from "../date/tipuri";
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

// Ieșirea din întuneric: pornește imediat, dar se așază lent.
const EASE_LUMINA = Easing.bezier(0.3, 0, 0.2, 1);

/** Încape eticheta (Inter 600, majuscule) pe un rând de `latime` px? */
const incapeEticheta = (text: string, marime: number, spatiere: number, latime: number) =>
  incapePeRand(text.toLocaleUpperCase("ro-RO"), "textSemibold", marime, spatiere, latime);

/**
 * Eticheta pe un singur rând: întâi strânge spațierea literelor, apoi micșorează
 * corpul; dacă tot nu încape, o lasă să se rupă (la separatori).
 */
const potrivesteEticheta = ({
  text,
  latime,
  marime,
  marimeMinima,
  spatiere,
  spatiereMinima,
}: {
  text: string;
  latime: number;
  marime: number;
  marimeMinima: number;
  spatiere: number;
  spatiereMinima: number;
}): { marime: number; spatiere: number; incape: boolean } => {
  const incape = (m: number, sp: number) => incapeEticheta(text, m, sp, latime);
  for (let sp = spatiere; sp >= spatiereMinima - 1e-6; sp -= 0.02) {
    if (incape(marime, sp)) return { marime, spatiere: sp, incape: true };
  }
  for (let m = marime; m >= marimeMinima; m -= 1) {
    if (incape(m, spatiereMinima)) return { marime: m, spatiere: spatiereMinima, incape: true };
  }
  return { marime: marimeMinima, spatiere: spatiereMinima, incape: false };
};

/**
 * Pentru intro fără fotografie: cercuri concentrice foarte fine, ca niște curbe
 * de nivel, care se desenează la început și apoi se dilată lent. Umplu spațiul
 * gol din partea opusă textului fără să-i fure atenția.
 */
const Contururi: React.FC<{
  progres: (de: number, la: number) => number;
  deriva: number;
}> = ({ progres, deriva }) => {
  const c = useCulori();
  const f = useFormat();
  // Centrul e în afara cadrului, sus-dreapta: se văd doar arce, nu o „țintă”.
  const cx = f.latime * (f.vertical ? 1.04 : 0.98);
  const cy = f.inaltime * (f.vertical ? 0.1 : 0.02);
  const n = 11;
  return (
    <AbsoluteFill style={{ scale: 1 + 0.05 * deriva, transformOrigin: `${cx}px ${cy}px` }}>
      <svg width={f.latime} height={f.inaltime} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: n }, (_, i) => {
          // cercuri ușor excentrice, ca niște curbe de nivel care se îndesesc spre dreapta
          const r = (240 + i * 118 + i * i * 6) * f.u;
          const x = cx - i * 26 * f.u;
          const y = cy + i * 14 * f.u;
          const lungime = 2 * Math.PI * r;
          const p = progres(0.15 + i * 0.06, 2.0 + i * 0.06);
          const accent = i === 3;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={r}
              fill="none"
              stroke={accent ? c.accent : c.text}
              strokeOpacity={accent ? 0.34 : 0.16 - i * 0.008}
              strokeWidth={Math.max(1, 2 * f.u)}
              strokeDasharray={lungime}
              strokeDashoffset={lungime * (1 - p)}
              transform={`rotate(${70 + i * 6} ${x} ${y})`}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/**
 * Deschiderea filmului: fotografie (sau fundalul viu) care se limpezește din
 * întuneric, eticheta introdusă de o linie de accent, titlul mare care urcă din
 * mască și subtitlul.
 */
export const Intro: React.FC<{ scena: ScenaIntro }> = ({ scena }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const c = useCulori();
  const f = useFormat();
  const { u, vertical } = f;

  // Ritmul de bază e gândit pentru 5 s; o scenă mai scurtă își comprimă intrarea,
  // una mai lungă o păstrează și doar ține cadrul mai mult.
  const k = Math.min(1, Math.max(0.5, durationInFrames / fps / 5));
  const t = (secunde: number) => secunde * k * fps;
  const progres = (de: number, la: number, easing = EASE_IESIRE) =>
    interpolate(frame, [t(de), t(la)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing,
    });
  // Mișcarea lentă și continuă din timpul menținerii (liniară pe toată scena).
  const deriva = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ——— Dimensiuni ———
  const latimeText = vertical
    ? f.latime - 2 * f.margineX
    : Math.min(1400 * u, f.latime - 2 * f.margineX);

  const titlu = potrivesteTitlu({
    text: scena.titlu,
    latime: latimeText,
    maxim: (vertical ? 132 : 150) * u,
    minim: 84 * u,
    minimExtrem: 64 * u,
    maxRanduri: vertical ? 4 : 3,
    preferaRanduri: true,
    prag: 0.88,
  });
  const inaltimeRand = inaltimeRandTitlu(scena.titlu);
  // rânduri echilibrate: coloana cea mai îngustă cu același număr de rânduri
  const latimeTitlu = latimeEchilibrata({
    text: scena.titlu,
    font: "titlu",
    marime: titlu.marime,
    latime: latimeText,
    spatiere: -0.02,
  });

  // Eticheta: pe un rând dacă se poate; altfel se rupe doar la separatorii „·”,
  // ca segmentele („Primăria comunei ...”, „2026”) să rămână întregi.
  const textEticheta = scena.eticheta?.trim() || null;
  const latimeEticheta = latimeText - 96 * u;
  const eticheta = textEticheta
    ? (() => {
        const p = potrivesteEticheta({
          text: textEticheta,
          latime: latimeEticheta,
          marime: 36 * u,
          marimeMinima: 32 * u,
          spatiere: 0.3,
          spatiereMinima: 0.18,
        });
        if (p.incape) {
          // cât se pot strânge literele la intrare fără ca rândul să iasă din zona sigură
          const strangere = incapeEticheta(textEticheta, p.marime, p.spatiere + 0.16, latimeText) ? 0.16 : 0.05;
          return { ...p, strangere, linii: [textEticheta] };
        }
        // Rândurile se compun aici, din segmente întregi („Primăria comunei ...”, „2026”),
        // cu separatorul „·” doar între segmentele de pe același rând: niciun rând nu
        // începe sau nu se termină cu un separator atârnat.
        const marime = 32 * u;
        const spatiere = 0.2;
        const segmente = textEticheta.split(/\s*[·|•]\s*/).filter(Boolean);
        const intregi = segmente.every((x) => incapeEticheta(x, marime, spatiere, latimeEticheta));
        if (!intregi) return { marime, spatiere, incape: false, strangere: 0, linii: [textEticheta] };
        const linii: string[] = [];
        for (const seg of segmente) {
          const ultim = linii[linii.length - 1];
          if (ultim !== undefined && incapeEticheta(`${ultim} · ${seg}`, marime, spatiere, latimeEticheta)) {
            linii[linii.length - 1] = `${ultim} · ${seg}`;
          } else {
            linii.push(seg);
          }
        }
        return { marime, spatiere, incape: false, strangere: 0, linii };
      })()
    : null;

  const subtitlu = scena.subtitlu?.trim() || null;
  const marimeSubtitlu = (subtitlu && subtitlu.length > 90 ? 40 : 46) * u;
  // subtitlul pe rânduri echilibrate (fără un cuvânt singur pe ultimul rând)
  const latimeSubtitlu = subtitlu
    ? latimeEchilibrata({
        text: subtitlu,
        font: "text",
        marime: marimeSubtitlu,
        latime: (vertical ? latimeText : Math.min(latimeText, 1080 * u)) * 0.98,
      })
    : 0;

  // ——— Calendarul intrării (secunde la ritmul de bază) ———
  const nrCuvinte = scena.titlu.split(/\s+/).filter(Boolean).length;
  const pasTitlu = nrCuvinte > 1 ? Math.min(0.08, 0.6 / (nrCuvinte - 1)) : 0;
  const startTitlu = eticheta ? 0.6 : 0.4;
  // subtitlul pornește cât titlul încă se așază, ca totul să fie lizibil în ~2 s
  const startSubtitlu = startTitlu + Math.min(pasTitlu * (nrCuvinte - 1), 0.35) + 0.45;
  const nrCuvinteSubtitlu = subtitlu ? subtitlu.split(/\s+/).length : 0;
  const pasSubtitlu = nrCuvinteSubtitlu > 1 ? Math.min(0.03, 0.35 / (nrCuvinteSubtitlu - 1)) : 0;

  const lumina = progres(0, 1.6, EASE_LUMINA);
  const linie = progres(0.3, 1.0);
  const intrareEticheta = progres(0.45, 1.35);

  return (
    <AbsoluteFill style={{ backgroundColor: c.fundal, overflow: "hidden" }}>
      {/* Fundalul: fotografia cu efect Ken Burns sau fundalul viu */}
      {scena.imagine ? (
        <AbsoluteFill
          style={{
            filter: lumina < 1 ? `blur(${(1 - lumina) * 14 * u}px)` : undefined,
          }}
        >
          <ImagineMiscare src={scena.imagine} zoom={[1.06, 1.15]} />
          {/* tentă discretă în culoarea principală, ca fotografiile să aparțină paletei */}
          <AbsoluteFill
            style={{ backgroundColor: c.principala, mixBlendMode: "soft-light", opacity: 0.18 }}
          />
          {/* voalurile întunecate pe care stă textul */}
          {vertical ? (
            <>
              <AbsoluteFill
                style={{
                  background: `linear-gradient(0deg, ${transparenta(c.fundal, 96)} 0%, ${transparenta(c.fundal, 90)} 28%, ${transparenta(c.fundal, 66)} 46%, ${transparenta(c.fundal, 28)} 60%, ${transparenta(c.fundal, 0)} 74%)`,
                }}
              />
              <AbsoluteFill
                style={{
                  background: `linear-gradient(180deg, ${transparenta(c.fundal, 60)} 0%, ${transparenta(c.fundal, 0)} 24%)`,
                }}
              />
            </>
          ) : (
            <>
              <AbsoluteFill
                style={{
                  background: `linear-gradient(90deg, ${transparenta(c.fundal, 80)} 0%, ${transparenta(c.fundal, 55)} 30%, ${transparenta(c.fundal, 16)} 60%, ${transparenta(c.fundal, 0)} 84%)`,
                }}
              />
              {/* o „baltă” de umbră în colțul din stânga-jos, exact sub text */}
              <AbsoluteFill
                style={{
                  background: `radial-gradient(ellipse 85% 95% at 0% 100%, ${transparenta(c.fundal, 82)} 0%, ${transparenta(c.fundal, 55)} 45%, ${transparenta(c.fundal, 0)} 78%)`,
                }}
              />
              <AbsoluteFill
                style={{
                  background: `linear-gradient(0deg, ${transparenta(c.fundal, 92)} 0%, ${transparenta(c.fundal, 55)} 32%, ${transparenta(c.fundal, 0)} 66%)`,
                }}
              />
              <AbsoluteFill
                style={{
                  background: `linear-gradient(180deg, ${transparenta(c.fundal, 50)} 0%, ${transparenta(c.fundal, 0)} 22%)`,
                }}
              />
            </>
          )}
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse 120% 110% at 50% 40%, transparent 58%, ${transparenta(c.fundal, 50)} 100%)`,
            }}
          />
        </AbsoluteFill>
      ) : (
        <>
          <Fundal />
          <Contururi progres={progres} deriva={deriva} />
        </>
      )}

      {/* O lumină largă și moale care traversează cadrul o singură dată */}
      <AbsoluteFill style={{ mixBlendMode: "screen", pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: "-25%",
            height: "150%",
            width: "70%",
            left: 0,
            rotate: "12deg",
            background:
              "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.045) 40%, rgba(255,255,255,0.075) 50%, rgba(255,255,255,0.045) 60%, rgba(255,255,255,0) 100%)",
            translate: `${interpolate(progres(0.9, 4.2, EASE_INTRARE_IESIRE), [0, 1], [-90, 160])}% 0`,
          }}
        />
      </AbsoluteFill>

      {/* Ieșirea din întuneric la începutul filmului */}
      <AbsoluteFill style={{ backgroundColor: c.fundal, opacity: 1 - lumina }} />

      {/* Blocul de text */}
      <div
        style={{
          position: "absolute",
          left: f.margineX,
          // în 9:16 deasupra zonei acoperite de legenda și butoanele aplicațiilor
          bottom: vertical ? f.margineJos + 20 * u : f.margineY * 1.5,
          width: latimeText,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          translate: `0 ${-10 * u * deriva}px`,
        }}
      >
        {/* Umbră moale care urmează blocul de text, oricât de înalt ar fi: textul rămâne lizibil pe orice fotografie */}
        {scena.imagine ? (
          <div
            style={{
              position: "absolute",
              zIndex: -1,
              left: -f.margineX - 160 * u,
              right: vertical ? -f.margineX - 160 * u : -260 * u,
              top: -220 * u,
              bottom: -260 * u,
              background: `radial-gradient(closest-side, ${transparenta(c.fundal, 70)} 0%, ${transparenta(c.fundal, 58)} 45%, ${transparenta(c.fundal, 26)} 75%, ${transparenta(c.fundal, 0)} 100%)`,
            }}
          />
        ) : null}
        {eticheta ? (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 24 * u,
              marginBottom: (vertical ? 40 : 36) * u,
            }}
          >
            <div
              style={{
                width: 72 * u,
                height: Math.max(1, 3 * u),
                // centrată pe primul rând al etichetei
                marginTop: (eticheta.marime * 1.3) / 2 - Math.max(1, 3 * u) / 2,
                flexShrink: 0,
                backgroundColor: c.accent,
                transformOrigin: "left center",
                scale: `${linie} 1`,
              }}
            />
            <div
              style={{
                fontFamily: FONT_TEXT,
                fontWeight: 600,
                fontSize: eticheta.marime,
                lineHeight: 1.3,
                textTransform: "uppercase",
                // „tracking in”: literele se strâng ușor; doar pe un rând, ca rupturile să nu sară
                letterSpacing: `${eticheta.spatiere + eticheta.strangere * (1 - intrareEticheta)}em`,
                whiteSpace: eticheta.incape ? "nowrap" : "normal",
                color: c.text,
                opacity: intrareEticheta * 0.92,
                translate: `${-14 * u * (1 - intrareEticheta)}px 0`,
              }}
            >
              {eticheta.linii.map((rand, i) => (
                <div key={i} style={{ whiteSpace: eticheta.linii.length > 1 ? "nowrap" : undefined }}>
                  {rand}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <TextAnimat
          text={scena.titlu}
          start={startTitlu * k}
          pas={pasTitlu * k}
          durata={0.95 * Math.max(k, 0.7)}
          style={{
            fontFamily: FONT_TITLU,
            fontWeight: 800,
            fontSize: titlu.marime,
            lineHeight: inaltimeRand,
            letterSpacing: "-0.02em",
            color: c.text,
            maxWidth: latimeTitlu,
          }}
        />

        {subtitlu ? (
          <TextAnimat
            text={subtitlu}
            start={startSubtitlu * k}
            pas={pasSubtitlu * k}
            durata={0.85 * Math.max(k, 0.7)}
            style={{
              marginTop: (vertical ? 44 : 40) * u,
              fontFamily: FONT_TEXT,
              fontWeight: 500,
              fontSize: marimeSubtitlu,
              lineHeight: 1.3,
              color: c.textSecundar,
              maxWidth: latimeSubtitlu,
            }}
          />
        ) : null}
      </div>

    </AbsoluteFill>
  );
};
