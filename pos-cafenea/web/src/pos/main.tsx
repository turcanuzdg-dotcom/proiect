import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { actualizare } from './actualizare';
import { App } from './App';
import './pos.css';

// Fără StrictMode: în dezvoltare ar trimite de două ori suma la terminal.
createRoot(document.getElementById('app')!).render(<App />);

// Service worker-ul păstrează aplicația în tabletă, ca să pornească și fără internet.
// O versiune nouă nu se aplică singură: ar reîncărca pagina în mijlocul unei plăți.
if ('serviceWorker' in navigator) {
  const aplica = registerSW({ immediate: true, onNeedRefresh: () => actualizare.marcheaza(aplica) });
}
