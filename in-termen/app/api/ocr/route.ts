import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { STORAGE_BUCKET } from "@/lib/constants";
import { getOcrProvider } from "@/lib/ocr";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { isAllowedMimeType, isOwnStoragePath } from "@/lib/utils/files";

export const dynamic = "force-dynamic";

/** Starea funcției OCR: dacă există un furnizor configurat pe server. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });
  const provider = getOcrProvider();
  return NextResponse.json({ configured: Boolean(provider), provider: provider?.label ?? null });
}

const requestSchema = z.object({
  path: z.string().min(1).max(300),
  /** Confirmarea explicită a utilizatorului că fișierul poate fi trimis furnizorului OCR. */
  consent: z.literal(true),
});

/** Trimite un fișier propriu (deja încărcat în Storage) la furnizorul OCR configurat. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Neautentificat." }, { status: 401 });

  const provider = getOcrProvider();
  if (!provider) {
    return NextResponse.json({ mode: "demo", error: "Niciun serviciu OCR nu este configurat." }, { status: 501 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Este nevoie de confirmarea ta înainte de trimiterea fișierului." },
      { status: 400 },
    );
  }
  if (!isOwnStoragePath(parsed.data.path, session.user.id)) {
    return NextResponse.json({ error: "Fișier invalid." }, { status: 400 });
  }
  if (!checkRateLimit("ocr", session.user.id).allowed) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  const { data: blob, error } = await session.supabase.storage.from(STORAGE_BUCKET).download(parsed.data.path);
  if (error || !blob || !isAllowedMimeType(blob.type)) {
    return NextResponse.json({ error: "Fișierul nu a putut fi citit." }, { status: 400 });
  }

  try {
    const result = await provider.extract({ bytes: await blob.arrayBuffer(), mimeType: blob.type });
    return NextResponse.json({
      mode: "live",
      provider: provider.label,
      suggestedExpiryDate: result.suggestedExpiryDate,
      textPreview: result.text.slice(0, 600),
    });
  } catch {
    return NextResponse.json({ error: "Serviciul OCR nu a răspuns. Completează datele manual." }, { status: 502 });
  }
}
