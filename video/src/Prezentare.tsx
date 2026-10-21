import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { Fragment } from "react";
import { AbsoluteFill, interpolate, useVideoConfig } from "remotion";
import { Granulatie } from "./componente/Fundal";
import type { Proiect, Scena } from "./date/tipuri";
import { Cifre } from "./scene/Cifre";
import { Etape } from "./scene/Etape";
import { Final } from "./scene/Final";
import { Foto } from "./scene/Foto";
import { InainteDupa } from "./scene/InainteDupa";
import { Intro } from "./scene/Intro";
import { CULORI_IMPLICITE, CuloriContext, sursa } from "./tema";
import { cadreScena, durataTranzitie, planTranzitii, prezentare } from "./tranzitii";

export { durataTotala } from "./tranzitii";

/** Granulația de film, o singură dată peste tot filmul (nu în fiecare scenă). */
const GRANULATIE = 0.06;

export const ScenaRandata: React.FC<{ scena: Scena }> = ({ scena }) => {
  switch (scena.tip) {
    case "intro":
      return <Intro scena={scena} />;
    case "foto":
      return <Foto scena={scena} />;
    case "inainte-dupa":
      return <InainteDupa scena={scena} />;
    case "cifre":
      return <Cifre scena={scena} />;
    case "etape":
      return <Etape scena={scena} />;
    case "final":
      return <Final scena={scena} />;
  }
};

/** O singură scenă, pentru lucru și verificare (compozițiile „Scena”). */
export const ScenaSingura: React.FC<{ scena: Scena; culori?: Proiect["culori"] }> = ({ scena, culori }) => {
  const paleta = { ...CULORI_IMPLICITE, ...culori };
  return (
    <CuloriContext.Provider value={paleta}>
      <AbsoluteFill style={{ backgroundColor: paleta.fundal }}>
        <ScenaRandata scena={scena} />
        <Granulatie opacitate={GRANULATIE} />
      </AbsoluteFill>
    </CuloriContext.Provider>
  );
};

/**
 * Filmul: scenele în ordine, legate de tranziții alese determinist după tipurile
 * scenelor (src/tranzitii/plan.ts), cu granulație de film peste tot și muzica,
 * dacă există, care intră scurt și se stinge odată cu ultima scenă.
 */
export const Prezentare: React.FC<Proiect> = (proiect) => {
  const { fps, durationInFrames } = useVideoConfig();
  const culori = { ...CULORI_IMPLICITE, ...proiect.culori };
  const tranzitii = planTranzitii(proiect.scene, fps);
  // Volumul muzicii: intră în 0,5 s și se stinge în ultimele 1,5 s ale filmului sau,
  // dacă melodia e mai scurtă decât filmul, în ultimele 1,5 s ale melodiei (fără tăietură
  // bruscă; restul filmului rămâne în liniște). Punctele sunt mereu crescătoare.
  const cadreMuzica = proiect.durataMuzica ? Math.floor(proiect.durataMuzica * fps) : Infinity;
  const capatMuzica = Math.max(4, Math.min(durationInFrames, cadreMuzica));
  const intrareMuzica = Math.min(0.5 * fps, capatMuzica / 4);
  const stingereMuzica = Math.max(intrareMuzica + 1, capatMuzica - 1 - 1.5 * fps);
  const sfarsitMuzica = Math.max(stingereMuzica + 1, capatMuzica - 1);

  return (
    <CuloriContext.Provider value={culori}>
      <AbsoluteFill style={{ backgroundColor: culori.fundal }}>
        <TransitionSeries>
          {proiect.scene.map((scena, i) => (
            <Fragment key={i}>
              {i > 0 ? (
                <TransitionSeries.Transition
                  presentation={prezentare(tranzitii[i - 1])}
                  timing={durataTranzitie(tranzitii[i - 1])}
                />
              ) : null}
              <TransitionSeries.Sequence name={`${i + 1}. ${scena.tip}`} durationInFrames={cadreScena(scena, fps)}>
                <ScenaRandata scena={scena} />
              </TransitionSeries.Sequence>
            </Fragment>
          ))}
        </TransitionSeries>
        <Granulatie opacitate={GRANULATIE} />
        {proiect.muzica ? (
          <Audio
            src={sursa(proiect.muzica)}
            volume={(f) =>
              interpolate(f, [0, intrareMuzica, stingereMuzica, sfarsitMuzica], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            }
          />
        ) : null}
      </AbsoluteFill>
    </CuloriContext.Provider>
  );
};
