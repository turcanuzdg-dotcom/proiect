import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { actualizare } from './actualizare';
import { App } from './App';
import './pos.css';

/** Cât de des caută tableta o versiune nouă a aplicației (ms). */
const VERIFICARE_ACTUALIZARE = 30 * 60_000;

// Fără StrictMode: în dezvoltare ar trimite de două ori suma la terminal.
createRoot(document.getElementById('app')!).render(<App />);

// Service worker-ul păstrează aplicația în tabletă, ca să pornească și fără internet.
// O versiune nouă nu se aplică singură: ar reîncărca pagina în mijlocul unei plăți.
// Tableta nu se reîncarcă zile întregi, iar browserul caută o versiune nouă doar la încărcare: o căutăm
// noi la 30 de minute și la revenirea internetului. Găsită, se aplică pe ecranul de PIN (vezi App.tsx).
if ('serviceWorker' in navigator) {
  const aplica = registerSW({
    immediate: true,
    onNeedRefresh: () => actualizare.marcheaza(aplica),
    onRegisteredSW(_url, inregistrare) {
      if (!inregistrare) return;
      const verifica = () => {
        if (navigator.onLine) void inregistrare.update().catch(() => {});
      };
      window.setInterval(verifica, VERIFICARE_ACTUALIZARE);
      window.addEventListener('online', verifica);
    },
  });
}
