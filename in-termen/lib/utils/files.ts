import { ALLOWED_MIME_TYPES, type AllowedMimeType } from "@/types/domain";

export const ALLOWED_EXTENSIONS: Record<string, AllowedMimeType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export interface FileLike {
  name: string;
  type: string;
  size: number;
}

export type FileValidationResult = { ok: true; mimeType: AllowedMimeType } | { ok: false; error: string };

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} MB`;
}

/**
 * Verifică tipul și dimensiunea unui fișier. Se folosește și în browser (înainte de încărcare),
 * și pe server (înainte de a emite URL-ul semnat de încărcare).
 */
export function validateFile(file: FileLike, maxBytes: number): FileValidationResult {
  if (!file.name || file.size <= 0) {
    return { ok: false, error: "Fișierul pare gol. Alege alt fișier." };
  }
  const extension = fileExtension(file.name);
  const mimeFromExtension = ALLOWED_EXTENSIONS[extension];
  if (!mimeFromExtension) {
    return { ok: false, error: "Sunt acceptate doar fișiere PDF, JPG, JPEG sau PNG." };
  }
  // Unele browsere nu raportează tipul; atunci ne bazăm pe extensie.
  const declared = file.type || mimeFromExtension;
  if (!isAllowedMimeType(declared) || declared !== mimeFromExtension) {
    return { ok: false, error: "Tipul fișierului nu corespunde extensiei. Sunt acceptate PDF, JPG sau PNG." };
  }
  if (file.size > maxBytes) {
    return { ok: false, error: `Fișierul este prea mare. Limita este ${formatFileSize(maxBytes)}.` };
  }
  return { ok: true, mimeType: declared };
}

/** Nume sigur pentru Storage: fără diacritice, spații sau caractere speciale. */
export function sanitizeFileName(name: string): string {
  const extension = fileExtension(name);
  const base = (extension ? name.slice(0, -(extension.length + 1)) : name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const safeBase = base || "document";
  return extension ? `${safeBase}.${extension}` : safeBase;
}

/** Calea în bucket: "<user_id>/<id unic>-<nume>". Primul segment este verificat de politicile Storage. */
export function buildStoragePath(userId: string, fileName: string, uniqueId: string): string {
  return `${userId}/${uniqueId}-${sanitizeFileName(fileName)}`;
}

export function isOwnStoragePath(path: string, userId: string): boolean {
  if (!path.startsWith(`${userId}/`)) return false;
  const rest = path.slice(userId.length + 1);
  return rest.length > 0 && !rest.includes("/") && !rest.includes("..");
}
