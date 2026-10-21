import { useState, type FormEvent } from 'react';
import { api, mesajEroare } from '../api';

export function Autentificare({ onIntrare }: { onIntrare: (token: string, utilizator: { nume: string }) => void }) {
  const [login, setLogin] = useState('');
  const [parola, setParola] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);

  const trimite = async (e: FormEvent) => {
    e.preventDefault();
    setLucreaza(true);
    setEroare(null);
    try {
      const r = await api.post<{ token: string; utilizator: { nume: string } }>('/api/auth/login', { login, parola });
      onIntrare(r.token, r.utilizator);
    } catch (err) {
      setEroare(mesajEroare(err));
    } finally {
      setLucreaza(false);
    }
  };

  return (
    <div className="pagina-login">
      <form className="card login" onSubmit={trimite}>
        <div className="marca">
          <img src="/icon.svg" alt="" width={36} height={36} />
          <div>
            <h1>Administrare cafenea</h1>
            <p className="slab">Stocuri, bani, rețetar, ture și rapoarte</p>
          </div>
        </div>
        {eroare && <div className="alerta pericol">{eroare}</div>}
        <label className="camp">
          <span>Utilizator</span>
          <input autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus />
        </label>
        <label className="camp">
          <span>Parola</span>
          <input type="password" autoComplete="current-password" value={parola} onChange={(e) => setParola(e.target.value)} required />
        </label>
        <button className="buton" type="submit" disabled={lucreaza}>
          {lucreaza ? 'Se verifică…' : 'Intră'}
        </button>
      </form>
    </div>
  );
}
