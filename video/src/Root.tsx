import { type CalculateMetadataFunction, Composition } from "remotion";
import { PROIECT_EXEMPLU } from "./date/exemplu";
import { durataScena, type Proiect, type Scena } from "./date/tipuri";
import { durataTotala, Prezentare, ScenaSingura } from "./Prezentare";

const FPS = 30;

const calculeazaDurata: CalculateMetadataFunction<Proiect> = ({ props }) => ({
  durationInFrames: durataTotala(props, FPS),
});

type PropsScena = { scena: Scena; culori?: Proiect["culori"] };
const calculeazaDurataScena: CalculateMetadataFunction<PropsScena> = ({ props }) => ({
  durationInFrames: Math.round(durataScena(props.scena) * FPS),
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 16:9 pentru site, YouTube, ecrane */}
      <Composition
        id="Prezentare"
        component={Prezentare}
        durationInFrames={durataTotala(PROIECT_EXEMPLU, FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={PROIECT_EXEMPLU}
        calculateMetadata={calculeazaDurata}
      />
      {/* 9:16 pentru Reels, TikTok, Shorts */}
      <Composition
        id="PrezentareVerticala"
        component={Prezentare}
        durationInFrames={durataTotala(PROIECT_EXEMPLU, FPS)}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={PROIECT_EXEMPLU}
        calculateMetadata={calculeazaDurata}
      />
      {/* O singură scenă, pentru lucru: --props='{"scena": {...}}' */}
      <Composition
        id="Scena"
        component={ScenaSingura}
        durationInFrames={150}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ scena: PROIECT_EXEMPLU.scene[0] } as PropsScena}
        calculateMetadata={calculeazaDurataScena}
      />
      <Composition
        id="ScenaVerticala"
        component={ScenaSingura}
        durationInFrames={150}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ scena: PROIECT_EXEMPLU.scene[0] } as PropsScena}
        calculateMetadata={calculeazaDurataScena}
      />
    </>
  );
};
