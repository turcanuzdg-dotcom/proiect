// Tableta de la tejghea: aplicația reală din web/src/pos, asociată din oficiu cu Tabletă Centru.
import { createRoot } from 'react-dom/client';
import { instaleazaPunte } from './punte';
import { App } from '../../../web/src/pos/App';
import * as stocare from '../../../web/src/pos/stocare';
import css from '../../../web/src/pos/pos.css?inline';

const sim = instaleazaPunte('pos');
document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

// Simularea începe de la zero la fiecare deschidere a paginii, deci și memoria tabletei.
if (sim.primaPornire('pos')) {
  await new Promise<void>((gata) => {
    const r = indexedDB.deleteDatabase('pos-cafenea');
    r.onsuccess = r.onerror = r.onblocked = () => gata();
  });
  await stocare.scrie('config', sim.tableta);
}
createRoot(document.getElementById('app')!).render(<App />);
sim.pregatit('pos', window);
