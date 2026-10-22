import { useSyncExternalStore } from 'react';
import type { EcranPAX, Hartie, TerminalSimulat } from '../server/terminal-simulat';

const lei = (n: number) => n.toLocaleString('ro-MD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function IconContactless() {
  return (
    <svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true" className="pax-icon">
      <g fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
        <path d="M14 16c3 4.5 3 11.5 0 16" />
        <path d="M21 12c4.6 6.9 4.6 17.1 0 24" />
        <path d="M28 8c6.2 9.4 6.2 22.6 0 32" />
        <path d="M35 4c7.8 11.7 7.8 28.3 0 40" />
      </g>
    </svg>
  );
}

function Ecran({ ecran, terminal }: { ecran: EcranPAX; terminal: TerminalSimulat }) {
  switch (ecran.tip) {
    case 'plata':
      return (
        <div className="pax-continut pax-plata">
          <div className="pax-eticheta">Plată cu cardul</div>
          <div className="pax-suma">
            {lei(ecran.suma)} <span>MDL</span>
          </div>
          <IconContactless />
          <div className="pax-indemn">Apropiați cardul de ecran</div>
          <div className="pax-butoane">
            <button className="pax-buton pax-buton-da" onClick={terminal.apropieCardul}>
              Apropie cardul
            </button>
            <button className="pax-buton pax-buton-nu" onClick={terminal.refuzaCardul}>
              Card refuzat
            </button>
          </div>
        </div>
      );
    case 'autorizare':
      return (
        <div className="pax-continut">
          <div className="pax-rotita" aria-hidden="true" />
          <div className="pax-indemn">Se autorizează la bancă…</div>
          <div className="pax-mic">{lei(ecran.suma)} MDL</div>
        </div>
      );
    case 'aprobat':
      return (
        <div className="pax-continut pax-aprobat">
          <div className="pax-semn" aria-hidden="true">✓</div>
          <div className="pax-titlu-mare">Aprobat</div>
          <div className="pax-mic">
            {lei(ecran.suma)} MDL · cod {ecran.autorizare}
          </div>
        </div>
      );
    case 'refuzat':
      return (
        <div className="pax-continut pax-refuzat">
          <div className="pax-semn" aria-hidden="true">✕</div>
          <div className="pax-titlu-mare">Refuzat</div>
          <div className="pax-mic">{ecran.mesaj}</div>
        </div>
      );
    case 'retur':
      return (
        <div className="pax-continut">
          <div className="pax-rotita" aria-hidden="true" />
          <div className="pax-indemn">Retur pe card</div>
          <div className="pax-mic">{lei(ecran.suma)} MDL</div>
        </div>
      );
    case 'tiparire':
      return (
        <div className="pax-continut">
          <div className="pax-rotita" aria-hidden="true" />
          <div className="pax-indemn">Se tipărește {ecran.ce}…</div>
        </div>
      );
    default:
      return (
        <div className="pax-continut pax-repaus">
          <div className="pax-titlu-mare">Gata de lucru</div>
          <div className="pax-mic">Suma și bonul vin singure de la tabletă</div>
        </div>
      );
  }
}

/** Un model de puncte în locul codului QR real de pe bon: decorativ, nu se poate scana. */
function ModelQR({ text }: { text: string }) {
  let s = 0;
  for (const c of text) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  const celule: [number, number][] = [];
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      const colt = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (colt) {
        const cx = x % 14 < 7 ? x % 7 : x - 14;
        const cy = y % 14 < 7 ? y % 7 : y - 14;
        const ram = cx === 0 || cx === 6 || cy === 0 || cy === 6 || (cx >= 2 && cx <= 4 && cy >= 2 && cy <= 4);
        if (ram) celule.push([x, y]);
        continue;
      }
      s = (s * 1103515245 + 12345) >>> 0;
      if ((s >>> 16) & 1) celule.push([x, y]);
    }
  return (
    <svg viewBox="0 0 21 21" width="72" height="72" className="hartie-qr" aria-label="Cod de verificare al bonului (decorativ)" role="img">
      {celule.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  );
}

function BucataHartie({ h, noua }: { h: Hartie; noua: boolean }) {
  return (
    <article className={`hartie${noua ? ' hartie-noua' : ''}`}>
      <header className="hartie-cap">
        <strong>{h.titlu}</strong>
        <span>{h.ora}</span>
      </header>
      {h.randuri.map((r, i) =>
        r.stil === 'linie' ? (
          <hr key={i} />
        ) : (
          <div key={i} className={`hartie-rand${r.stil ? ` hartie-${r.stil}` : ''}`}>
            <span>{r.text}</span>
            {r.suma && <span>{r.suma}</span>}
          </div>
        ),
      )}
      {h.qr && <ModelQR text={h.qr} />}
    </article>
  );
}

export function TerminalPAX({ terminal }: { terminal: TerminalSimulat }) {
  const { ecran, hartii } = useSyncExternalStore(terminal.aboneaza, terminal.citeste);
  const ora = new Date().toLocaleTimeString('ro-MD', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Chisinau' });
  return (
    <div className="pax">
      <div className={`pax-aparat${ecran.tip === 'plata' ? ' pax-asteapta' : ''}`}>
        <div className="pax-fanta" aria-hidden="true" />
        <div className="pax-ecran" aria-live="polite">
          <div className="pax-bara">
            <span>IS Fiscal</span>
            <span>{ora} · 87%</span>
          </div>
          <Ecran ecran={ecran} terminal={terminal} />
        </div>
        <div className="pax-marca">PAX A930 · simulat</div>
      </div>
      <section className="pax-hartii" aria-label="Ce a tipărit terminalul">
        {hartii.length === 0 ? (
          <p className="pax-gol">Bonurile fiscale tipărite de terminal apar aici.</p>
        ) : (
          hartii.map((h, i) => <BucataHartie key={h.id} h={h} noua={i === 0} />)
        )}
      </section>
    </div>
  );
}
