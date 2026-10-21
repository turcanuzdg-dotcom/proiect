import { type CalculateMetadataFunction, Composition } from "remotion";
import { PROIECT_EXEMPLU } from "./date/exemplu";
import type { Proiect, Scena } from "./date/tipuri";
import { pregatesteProiect } from "./date/verificare";
import { Prezentare, ScenaSingura } from "./Prezentare";
import { cadreScena, durataTotala } from "./tranzitii";

const FPS = 30;

// Înainte de randare: datele sunt verificate (mesaj clar la o greșeală), fișierele
// găsite (și cu nume NFC/NFD), iar durata muzicii citită.
const calculeazaDurata: CalculateMetadataFunction<Proiect> = async ({ props }) => {
  const proiect = await pregatesteProiect(props);
  return { durationInFrames: durataTotala(proiect, FPS), props: proiect };
};

type PropsScena = { scena: Scena; culori?: Proiect["culori"] };
const calculeazaDurataScena: CalculateMetadataFunction<PropsScena> = async ({ props }) => {
  const { scene } = await pregatesteProiect({ scene: [props.scena] });
  return { durationInFrames: cadreScena(scene[0], FPS), props: { ...props, scena: scene[0] } };
};

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
