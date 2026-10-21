import { linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { Cortina } from "./Cortina";
import { Estompare } from "./Estompare";
import { Glisare } from "./Glisare";
import { Lumina } from "./Lumina";
import type { Tranzitie } from "./plan";

export { cadreScena, cronologie, durataTotala, planTranzitii, type Tranzitie } from "./plan";

type Prezentare = TransitionPresentation<Record<string, unknown>>;

/** Prezentarea Remotion pentru o tranziție din plan. Easing-ul e aplicat în interiorul fiecăreia. */
export const prezentare = (t: Tranzitie): Prezentare => {
  switch (t.tip) {
    case "cortina":
      return { component: Cortina, props: { sens: t.sens } } as Prezentare;
    case "glisare":
      return { component: Glisare, props: {} } as Prezentare;
    case "lumina":
      return { component: Lumina, props: {} } as Prezentare;
    case "estompare":
      return { component: Estompare, props: {} } as Prezentare;
  }
};

export const durataTranzitie = (t: Tranzitie) => linearTiming({ durationInFrames: t.durataCadre });
