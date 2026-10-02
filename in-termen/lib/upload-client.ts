"use client";

import { requestUploadUrl } from "@/lib/actions/documents";
import { maxUploadBytes, publicConfig } from "@/lib/config";
import { validateFile } from "@/lib/utils/files";
import type { UploadedFileRef } from "@/types/domain";

export class UploadError extends Error {}

/**
 * Încarcă un fișier în bucket-ul privat:
 * 1. validare în browser (tip, dimensiune);
 * 2. serverul validează din nou și emite un URL semnat pentru dosarul utilizatorului;
 * 3. browserul trimite fișierul direct la Supabase Storage, raportând progresul.
 */
export async function uploadDocumentFile(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadedFileRef> {
  const check = validateFile(file, maxUploadBytes);
  if (!check.ok) throw new UploadError(check.error);

  const signed = await requestUploadUrl({ fileName: file.name, mimeType: check.mimeType, size: file.size });
  if (!signed.ok) throw new UploadError(signed.error);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signed.data.signedUrl);
    // Cheia publică „anon” este cerută de gateway-ul Supabase; drepturile vin din tokenul semnat.
    xhr.setRequestHeader("apikey", publicConfig.supabaseAnonKey);
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new UploadError("Încărcarea nu a reușit. Verifică fișierul și încearcă din nou."));
    };
    xhr.onerror = () => reject(new UploadError("Conexiunea s-a întrerupt. Încearcă din nou."));
    xhr.onabort = () => reject(new UploadError("Încărcarea a fost anulată."));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", new Blob([file], { type: check.mimeType }), file.name);
    xhr.send(body);
  });

  onProgress(100);
  return { path: signed.data.path, name: file.name, mimeType: signed.data.mimeType };
}
