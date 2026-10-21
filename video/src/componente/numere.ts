// Numerele în format românesc, pentru scena „cifre”.

const zecimale = (v: number) => {
  if (!Number.isFinite(v) || Number.isInteger(v)) return 0;
  const s = String(Math.abs(v));
  const i = s.indexOf(".");
  return i < 0 ? 0 : Math.min(2, s.length - i - 1);
};

const formatoare = new Map<number, Intl.NumberFormat>();
const formator = (z: number) => {
  let f = formatoare.get(z);
  if (!f) {
    f = new Intl.NumberFormat("ro-RO", {
      minimumFractionDigits: z,
      maximumFractionDigits: z,
      useGrouping: true,
    });
    formatoare.set(z, f);
  }
  return f;
};

const esteCifra = (ch: string) => ch >= "0" && ch <= "9";

/** Valoarea finală, formatată românește: 12500 → „12.500”, 2.5 → „2,5”. */
export const formateazaFinal = (valoare: number) => {
  const v = Number.isFinite(valoare) ? valoare : 0;
  return (v < 0 ? "−" : "") + formator(zecimale(v)).format(Math.abs(v));
};

/**
 * Valoarea din timpul numărătorii, așezată pe șablonul valorii finale: aceleași
 * poziții de cifre și separatori, deci aceeași lățime de la primul cadru (nimic
 * nu „sare”). Pozițiile încă neatinse sunt zerouri „fantomă” (`fantoma`), restul
 * cifre reale (`real`).
 */
export const formateazaPartial = (valoare: number, progres: number) => {
  const v = Number.isFinite(valoare) ? valoare : 0;
  const z = zecimale(v);
  const semn = v < 0 ? "−" : "";
  const final = formator(z).format(Math.abs(v));
  const p = Math.min(1, Math.max(0, progres));
  if (p >= 1) return { fantoma: "", real: semn + final };
  const curent = Math.round(Math.abs(v) * p * 10 ** z) / 10 ** z;
  const cifreCurente = Array.from(formator(z).format(curent)).filter(esteCifra);
  const sloturi = Array.from(final).filter(esteCifra).length;
  const umplutura = Math.max(0, sloturi - cifreCurente.length);
  const cifre = [
    ...Array(umplutura).fill("0"),
    ...cifreCurente.slice(-sloturi),
  ];

  let fantoma = "";
  let real = "";
  let k = 0;
  for (const ch of Array.from(final)) {
    if (esteCifra(ch)) {
      const d = cifre[k] ?? "0";
      if (k < umplutura) fantoma += d;
      else real += d;
      k++;
    } else if (k <= umplutura && real === "") {
      // separatorul dintre zerourile fantomă rămâne și el estompat
      fantoma += ch;
    } else {
      real += ch;
    }
  }
  return {
    fantoma: semn && fantoma ? semn + fantoma : fantoma,
    real: semn && !fantoma ? semn + real : real,
  };
};
