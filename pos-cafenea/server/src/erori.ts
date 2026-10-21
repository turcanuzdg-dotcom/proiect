/** Eroare provocată de date greșite: ajunge la client ca 400 cu mesajul în română. */
export class EroareUtilizator extends Error {
  constructor(mesaj: string, public status = 400) {
    super(mesaj);
  }
}

export class EroareNegasit extends EroareUtilizator {
  constructor(ce: string) {
    super(`${ce} nu există`, 404);
  }
}
