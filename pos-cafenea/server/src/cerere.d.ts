import type { DispozitivAutentificat, UtilizatorAutentificat } from './servicii/acces';

// Cine a trimis cererea: îl pun verificările de acces (doarAdmin, doarDispozitiv) din app.ts.
declare module 'fastify' {
  interface FastifyRequest {
    utilizator?: UtilizatorAutentificat;
    dispozitiv?: DispozitivAutentificat;
    /** Starea de dinainte a ce modifică cererea; ajunge în jurnalul de audit (servicii/audit.ts). */
    auditInainte?: unknown;
    /** Ce se scrie în jurnal în locul corpului cererii (de ex. doar liniile de inventar schimbate). */
    auditCorp?: unknown;
  }
}
