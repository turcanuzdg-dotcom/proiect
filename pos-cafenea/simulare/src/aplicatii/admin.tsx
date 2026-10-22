// Panoul de administrare: aplicația reală din web/src/admin, deja autentificată ca admin.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { instaleazaPunte } from './punte';
import { salveazaToken } from '../../../web/src/admin/api';
import { App } from '../../../web/src/admin/App';
import css from '../../../web/src/admin/admin.css?inline';

const sim = instaleazaPunte('admin');
document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
salveazaToken(sim.tokenAdmin);
createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
sim.pregatit('admin', window);
