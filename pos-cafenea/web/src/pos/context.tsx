import { createContext, useContext } from 'react';
import type { CatalogPOS, EvenimentPOS } from '@cafenea/shared';
import type { Echipamente } from './echipamente';
import type { StareSync } from './sincronizare';
import type { BaristaActiv, ComandaLocala, ConfigTableta, OptiuniInregistrare, TuraLocala } from './stocare';

export interface Aplicatie {
  config: ConfigTableta;
  catalog: CatalogPOS;
  barista: BaristaActiv;
  tura: TuraLocala;
  echipamente: Echipamente;
  sync: StareSync;
  /** Salvează local evenimentul (și comanda) și pornește sincronizarea. */
  inregistreaza(ev: EvenimentPOS, comanda?: ComandaLocala, opt?: OptiuniInregistrare): Promise<void>;
  /** Construiește un eveniment cu id și moment proprii. */
  eveniment<T extends EvenimentPOS['tip']>(tip: T, date: Extract<EvenimentPOS, { tip: T }>['date']): Extract<EvenimentPOS, { tip: T }>;
  anunta(mesaj: string, pericol?: boolean): void;
  inchideTura(): void;
  blocheaza(): void;
  reincarcaEchipamente(): Promise<void>;
}

export const ContextAplicatie = createContext<Aplicatie | null>(null);

export function useAplicatie(): Aplicatie {
  const a = useContext(ContextAplicatie);
  if (!a) throw new Error('useAplicatie în afara aplicației');
  return a;
}
