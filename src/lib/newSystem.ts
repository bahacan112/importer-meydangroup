import { z } from "zod";

// Reuse ProductSchema-like structure but import-free to avoid circular deps
export const NewSystemProductSchema = z.object({
  KOD: z.string().min(1),
  OEM: z.string().nullable().optional(),
  STOK_ADI: z.string().min(1),
  FIYAT: z.union([z.number(), z.string()]).optional(),
  MARKA: z.string().nullable().optional(),
  MODEL: z.string().nullable().optional(),
  ANA_GRUP: z.string().nullable().optional(),
  ALT_GRUP: z.string().nullable().optional(),
  BAKIYE: z.union([z.number(), z.string()]).optional(),
  GORSELLER: z.array(z.string()).optional(),
});

export type NewSystemRawProduct = z.infer<typeof NewSystemProductSchema>;

export type ParsedProduct = {
  sku: string;
  name: string;
  description?: string;
  short_description?: string;
  regular_price?: string;
  sale_price?: string;
  stock_quantity?: number;
  manage_stock?: boolean;
  status?: "draft" | "publish";
  images?: { src: string; name?: string; alt?: string }[];
  categories?: { name: string }[];
  tags?: { name: string }[];
};

function toPriceString(val: any): string | undefined {
  if (val === null || val === undefined) return undefined;
  // Sayısal tip ise doğrudan kullan
  if (typeof val === "number") {
    if (!isFinite(val)) return undefined;
    return String(val);
  }
  let s = String(val).trim();
  if (!s) return undefined;
  // Boşluk ve para birimi gibi karakterleri temizle
  s = s.replace(/\s+/g, "");
  // Hem ',' hem '.' varsa, son görünen ayıracı ondalık kabul ederek normalize et
  if (s.includes(',') && s.includes('.')) {
    const commaLast = s.lastIndexOf(',');
    const dotLast = s.lastIndexOf('.');
    const lastSepIsComma = commaLast > dotLast;
    if (lastSepIsComma) {
      // Binlik: '.'
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Binlik: ','
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // Tek ayraç ',' ise ondalık olarak ele al
    s = s.replace(/\./g, '');
    s = s.replace(',', '.');
  } else {
    // Tek ayraç '.' ise ondalık olarak ele al, binlik ',' varsa temizle
    s = s.replace(/,/g, '');
  }
  // Geçersiz karakterleri temizle (rakam, nokta, eksi işareti dışındakiler)
  s = s.replace(/[^0-9.\-]/g, '');
  // Birden fazla nokta varsa sonuncuyu ondalık olacak şekilde birleştir
  const parts = s.split('.');
  if (parts.length > 2) {
    const last = parts.pop();
    s = parts.join('') + (last ? '.' + last : '');
  }
  if (!s || s === '.' || s === '-' || s === '-.') return undefined;
  return s;
}

function toStockNumber(val: any): number | undefined {
  if (val === null || val === undefined) return undefined;
  const n = Number(String(val).replace(/[^0-9-]/g, ""));
  return Number.isNaN(n) ? undefined : n;
}

export async function fetchNewSystemProducts(apiUrl: string): Promise<NewSystemRawProduct[]> {
  const res = await fetch(apiUrl, { method: "GET" });
  if (!res.ok) throw new Error(`Yeni Sistem API indirilemedi: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const arr: any[] = Array.isArray(data) ? data : (data?.items || data?.products || []);
  return arr
    .map((p) => {
      const parsed = NewSystemProductSchema.safeParse(p);
      return parsed.success ? parsed.data : null;
    })
    .filter((x): x is NewSystemRawProduct => !!x);
}

export function mapNewSystemToProducts(raw: NewSystemRawProduct[], imageBaseUrl?: string): ParsedProduct[] {
  const normBase = imageBaseUrl ? imageBaseUrl.replace(/\/$/, "") : undefined;
  return raw.map((p) => {
    const sku = String(p.KOD);
    const baseName = String(p.STOK_ADI);
    const oem = p.OEM ? String(p.OEM).trim() : "";
    const name = oem && oem.length > 0 ? `${oem} - ${baseName}` : baseName;
    const descriptionParts = [p.OEM, p.MARKA, p.MODEL].filter((x) => !!x && String(x).trim().length > 0).map((x) => String(x));
    const description = descriptionParts.join(" - ") || undefined;
    const regular_price = toPriceString(p.FIYAT);
    const stock_quantity = toStockNumber(p.BAKIYE);
    const manage_stock = stock_quantity !== undefined;
    const placeholder = (oem ? `${oem}-` : "") + baseName;
    const images = (p.GORSELLER || [])
      .map((src) => {
        const full = normBase ? `${normBase}${src.startsWith("/") ? src : "/" + src}` : src;
        try {
          // Basic URL sanity; if not absolute and no base, skip
          if (!normBase) {
            const u = new URL(full, "http://invalid.local");
            const pathOnly = u.pathname || full;
            return { src: pathOnly, name: placeholder, alt: placeholder };
          }
          const u = new URL(full);
          return { src: u.toString(), name: placeholder, alt: placeholder };
        } catch {
          return { src: full, name: placeholder, alt: placeholder };
        }
      })
      .filter((i) => i && i.src);
    const categories: { name: string }[] = [];
    // Kullanıcı talebine göre kategori zinciri: MARKA > MODEL > ALT_GRUP
    if (p.MARKA) categories.push({ name: String(p.MARKA) });
    if (p.MODEL) categories.push({ name: String(p.MODEL) });
    if (p.ALT_GRUP) categories.push({ name: String(p.ALT_GRUP) });
    // Taglar: OEM, MARKA, MODEL, Ürün adı
    const tags: { name: string }[] = [];
    if (oem) tags.push({ name: oem });
    if (p.MARKA) tags.push({ name: String(p.MARKA) });
    if (p.MODEL) tags.push({ name: String(p.MODEL) });
    if (baseName) tags.push({ name: baseName });

    return {
      sku,
      name,
      description,
      short_description: undefined,
      regular_price,
      sale_price: undefined,
      stock_quantity,
      manage_stock,
      status: "publish",
      images,
      categories,
      tags,
    };
  });
}