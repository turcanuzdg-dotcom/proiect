import "server-only";

import { guessExpiryDate } from "@/lib/ocr/extract-dates";
import { isOcrConfigured, serverConfig } from "@/lib/server-config";
import type { AllowedMimeType } from "@/types/domain";

/**
 * Punctul unic de integrare OCR. Pentru un furnizor nou (AWS Textract, Azure, Tesseract pe server)
 * adaugă o implementare OcrProvider și selecteaz-o prin OCR_PROVIDER.
 * Fișierele se trimit la un furnizor extern DOAR după confirmarea explicită a utilizatorului
 * (vezi app/api/ocr/route.ts și componenta OcrAssistant).
 */

export interface OcrResult {
  text: string;
  suggestedExpiryDate: string | null;
}

export interface OcrProvider {
  id: string;
  label: string;
  extract(file: { bytes: ArrayBuffer; mimeType: AllowedMimeType }): Promise<OcrResult>;
}

const googleVision: OcrProvider = {
  id: "google_vision",
  label: "Google Cloud Vision",
  async extract({ bytes, mimeType }) {
    const content = Buffer.from(bytes).toString("base64");
    const key = encodeURIComponent(serverConfig.googleVisionApiKey);
    const isPdf = mimeType === "application/pdf";
    const endpoint = isPdf
      ? `https://vision.googleapis.com/v1/files:annotate?key=${key}`
      : `https://vision.googleapis.com/v1/images:annotate?key=${key}`;
    const feature = { type: "DOCUMENT_TEXT_DETECTION" };
    const request = isPdf
      ? { requests: [{ inputConfig: { content, mimeType }, features: [feature], pages: [1, 2] }] }
      : {
          requests: [{ image: { content }, features: [feature], imageContext: { languageHints: ["ro", "ru", "en"] } }],
        };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`ocr_http_${response.status}`);

    const json = (await response.json()) as {
      responses?: Array<{
        fullTextAnnotation?: { text?: string };
        responses?: Array<{ fullTextAnnotation?: { text?: string } }>;
      }>;
    };
    const first = json.responses?.[0];
    const text = isPdf
      ? (first?.responses ?? []).map((page) => page.fullTextAnnotation?.text ?? "").join("\n")
      : (first?.fullTextAnnotation?.text ?? "");
    return { text, suggestedExpiryDate: guessExpiryDate(text) };
  },
};

export function getOcrProvider(): OcrProvider | null {
  if (!isOcrConfigured()) return null;
  if (serverConfig.ocrProvider === "google_vision") return googleVision;
  return null;
}
