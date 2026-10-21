import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './pos.css';

// Fără StrictMode: în dezvoltare ar trimite de două ori suma la terminal.
createRoot(document.getElementById('app')!).render(<App />);

// Service worker-ul păstrează aplicația în tabletă, ca să pornească și fără internet.
if ('serviceWorker' in navigator) registerSW({ immediate: true });
