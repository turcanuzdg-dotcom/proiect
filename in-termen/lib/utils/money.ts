import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from "@/lib/constants";
import { CURRENCIES, type Currency } from "@/types/domain";

export function isCurrency(value: string | null | undefined): value is Currency {
  return Boolean(value) && (CURRENCIES as readonly string[]).includes(value as string);
}

/** Ex.: „250,00 MDL”. Moneda necunoscută revine la MDL. */
export function formatMoney(amount: number, currency: string | null | undefined = DEFAULT_CURRENCY): string {
  const code = isCurrency(currency) ? currency : DEFAULT_CURRENCY;
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency: code,
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Acceptă „150”, „150,5” sau „150.50”; întoarce null pentru text gol sau invalid. */
export function parseAmount(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
}
