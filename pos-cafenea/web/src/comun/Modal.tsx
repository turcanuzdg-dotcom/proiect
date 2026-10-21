import { useEffect, type ReactNode } from 'react';

export function Modal(props: { titlu: string; onInchide?: () => void; children: ReactNode; lat?: boolean; subsol?: ReactNode }) {
  useEffect(() => {
    if (!props.onInchide) return;
    const tasta = (e: KeyboardEvent) => e.key === 'Escape' && props.onInchide?.();
    window.addEventListener('keydown', tasta);
    return () => window.removeEventListener('keydown', tasta);
  }, [props.onInchide]);
  return (
    <div className="fundal-modal" onMouseDown={(e) => e.target === e.currentTarget && props.onInchide?.()}>
      <div className={`modal${props.lat ? ' modal-lat' : ''}`} role="dialog" aria-modal="true" aria-label={props.titlu}>
        <header className="modal-cap">
          <h2>{props.titlu}</h2>
          {props.onInchide && (
            <button type="button" className="buton-icon" onClick={props.onInchide} aria-label="Închide">
              ×
            </button>
          )}
        </header>
        <div className="modal-corp">{props.children}</div>
        {props.subsol && <footer className="modal-subsol">{props.subsol}</footer>}
      </div>
    </div>
  );
}
