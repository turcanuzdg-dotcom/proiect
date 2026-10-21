import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Fragment } from "react";
import { AbsoluteFill, staticFile, useVideoConfig } from "remotion";
import { durataScena, type Proiect, type Scena } from "./date/tipuri";
import { Cifre } from "./scene/Cifre";
import { Etape } from "./scene/Etape";
import { Final } from "./scene/Final";
import { Foto } from "./scene/Foto";
import { InainteDupa } from "./scene/InainteDupa";
import { Intro } from "./scene/Intro";
import { CULORI_IMPLICITE, CuloriContext } from "./tema";

export const TRANZITIE_SECUNDE = 0.6;

export const durataTotala = (p: Proiect, fps: number) => {
  const t = Math.round(TRANZITIE_SECUNDE * fps);
  const scene = p.scene.reduce((s, x) => s + Math.round(durataScena(x) * fps), 0);
  return Math.max(1, scene - t * Math.max(0, p.scene.length - 1));
};

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
export const ScenaSingura: React.FC<{ scena: Scena; culori?: Proiect["culori"] }> = ({
  scena,
  culori,
}) => (
  <CuloriContext.Provider value={{ ...CULORI_IMPLICITE, ...culori }}>
    <AbsoluteFill style={{ backgroundColor: CULORI_IMPLICITE.fundal }}>
      <ScenaRandata scena={scena} />
    </AbsoluteFill>
  </CuloriContext.Provider>
);

export const Prezentare: React.FC<Proiect> = (proiect) => {
  const { fps } = useVideoConfig();
  const culori = { ...CULORI_IMPLICITE, ...proiect.culori };
  const tranzitie = Math.round(TRANZITIE_SECUNDE * fps);

  return (
    <CuloriContext.Provider value={culori}>
      <AbsoluteFill style={{ backgroundColor: culori.fundal }}>
        <TransitionSeries>
          {proiect.scene.map((scena, i) => (
            <Fragment key={i}>
              {i > 0 ? (
                <TransitionSeries.Transition
                  presentation={fade()}
                  timing={linearTiming({ durationInFrames: tranzitie })}
                />
              ) : null}
              <TransitionSeries.Sequence
                name={`${i + 1}. ${scena.tip}`}
                durationInFrames={Math.round(durataScena(scena) * fps)}
              >
                <ScenaRandata scena={scena} />
              </TransitionSeries.Sequence>
            </Fragment>
          ))}
        </TransitionSeries>
        {proiect.muzica ? <Audio src={staticFile(proiect.muzica)} /> : null}
      </AbsoluteFill>
    </CuloriContext.Provider>
  );
};
