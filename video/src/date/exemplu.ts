import type { Proiect } from "./tipuri";

// Date FICTIVE, doar pentru a vedea șablonul. Proiectul real vine din `--props`.
export const PROIECT_EXEMPLU: Proiect = {
  scene: [
    {
      tip: "intro",
      eticheta: "Comuna Exemplu · 2026",
      titlu: "Parcul central, renovat",
      subtitlu: "Un spațiu verde nou pentru toată comunitatea",
      imagine: "exemplu/parc-dupa.jpg",
    },
    {
      tip: "foto",
      imagine: "exemplu/alee.jpg",
      titlu: "Alei noi și iluminat LED",
      text: "Pavaj ecologic și 48 de corpuri de iluminat",
    },
    {
      tip: "inainte-dupa",
      inainte: "exemplu/parc-inainte.jpg",
      dupa: "exemplu/parc-dupa.jpg",
      titlu: "Înainte și după",
    },
    {
      tip: "cifre",
      titlu: "Proiectul în cifre",
      cifre: [
        { valoare: 12500, sufix: " m²", eticheta: "suprafață amenajată" },
        { valoare: 320, eticheta: "arbori și arbuști plantați" },
        { valoare: 48, eticheta: "corpuri de iluminat LED" },
      ],
    },
    {
      tip: "foto",
      imagine: "exemplu/loc-joaca.jpg",
      titlu: "Loc de joacă modern",
      text: "Echipamente certificate, suprafață antișoc",
    },
    {
      tip: "etape",
      titlu: "Etapele proiectului",
      etape: [
        { data: "Ianuarie 2025", text: "Proiectare și consultări publice" },
        { data: "Aprilie 2025", text: "Începerea lucrărilor" },
        { data: "Septembrie 2025", text: "Amenajarea spațiilor verzi" },
        { data: "Mai 2026", text: "Recepția și deschiderea parcului" },
      ],
    },
    {
      tip: "final",
      titlu: "Împreună construim comunitatea",
      text: "Mulțumim tuturor celor care au contribuit",
      logouri: [
        "exemplu/logo-exemplu-1.png",
        "exemplu/logo-exemplu-2.png",
        "exemplu/logo-exemplu-3.png",
        "exemplu/logo-exemplu-4.png",
      ],
      contact: "exemplu.md",
    },
  ],
};
