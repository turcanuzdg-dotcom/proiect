import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './admin.css';
import { App } from './App';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
