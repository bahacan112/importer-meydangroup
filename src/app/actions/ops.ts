"use server";
import { listAllProducts, updateProduct } from "@/lib/woocommerce";

export type PriceOpsOptions = {
  percent: number; // e.g. 20
  applyOn?: "regular" | "sale" | "both";
  roundToInteger?: boolean;
  categoryIds?: number[];
  tagIds?: number[];
  categoryNameIncludes?: string; // basit isim filtreleme
  tagNameIncludes?: string;
};

export async function increasePricesGlobally(options: PriceOpsOptions) {
  const applyOn = options.applyOn || "regular";
  const factor = 1 + options.percent / 100;
  const roundToInteger = options.roundToInteger ?? true;
  const apply = (v?: string) => {
    if (!v) return undefined;
    const n = parseFloat(String(v));
    if (Number.isNaN(n)) return v;
    const res = n * factor;
    return roundToInteger ? String(Math.round(res)) : res.toFixed(2);
  };

  const products = await listAllProducts();
  let updated = 0;
  for (const p of products) {
    // Kategori/tag filtreleri
    if (options.categoryIds && options.categoryIds.length) {
      const ids = (p.categories || []).map((c: any) => c.id);
      if (!ids.some((id: number) => options.categoryIds!.includes(id))) continue;
    }
    if (options.tagIds && options.tagIds.length) {
      const ids = (((p as any).tags) || []).map((t: any) => t.id);
      if (!ids.some((id: number) => options.tagIds!.includes(id))) continue;
    }
    if (options.categoryNameIncludes) {
      const names = (p.categories || []).map((c: any) => String(c.name).toLowerCase());
      if (!names.some((n: string) => n.includes(options.categoryNameIncludes!.toLowerCase()))) continue;
    }
    if (options.tagNameIncludes) {
      const names = (((p as any).tags) || []).map((t: any) => String(t.name).toLowerCase());
      if (!names.some((n: string) => n.includes(options.tagNameIncludes!.toLowerCase()))) continue;
    }
    try {
      const payload: any = {};
      if (applyOn === "regular") payload.regular_price = apply(p.regular_price);
      else if (applyOn === "sale") payload.sale_price = apply(p.sale_price);
      else {
        payload.regular_price = apply(p.regular_price);
        payload.sale_price = apply(p.sale_price);
      }
      if (p.id && (payload.regular_price !== undefined || payload.sale_price !== undefined)) {
        await updateProduct(p.id, payload);
        updated++;
      }
    } catch (e) {
      console.error("Toplu fiyat güncelleme hata", p.id, e);
    }
  }
  return { updated, total: products.length };
}

export async function increasePricesForm(formData: FormData) {
  const percent = Number(formData.get("percent") || 0);
  const applyOn = (formData.get("applyOn")?.toString() as any) || "regular";
  const roundToInteger = formData.get("roundToInteger") ? true : false;
  const parseCsvNums = (s?: string | null) => (s ? s.split(",").map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n)) : []);
  const categoryIds = parseCsvNums(formData.get("categoryIds")?.toString());
  const tagIds = parseCsvNums(formData.get("tagIds")?.toString());
  const categoryNameIncludes = formData.get("categoryNameIncludes")?.toString() || undefined;
  const tagNameIncludes = formData.get("tagNameIncludes")?.toString() || undefined;
  await increasePricesGlobally({ percent, applyOn, roundToInteger, categoryIds, tagIds, categoryNameIncludes, tagNameIncludes });
}

// useFormState ile geri bildirim için state dönen sürüm
export async function increasePricesFormAction(prevState: any, formData: FormData) {
  const percent = Number(formData.get("percent") || 0);
  const applyOn = (formData.get("applyOn")?.toString() as any) || "regular";
  const roundToInteger = formData.get("roundToInteger") ? true : false;
  const parseCsvNums = (s?: string | null) => (s ? s.split(",").map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n)) : []);
  const categoryIds = parseCsvNums(formData.get("categoryIds")?.toString());
  const tagIds = parseCsvNums(formData.get("tagIds")?.toString());
  const categoryNameIncludes = formData.get("categoryNameIncludes")?.toString() || undefined;
  const tagNameIncludes = formData.get("tagNameIncludes")?.toString() || undefined;
  try {
    const result = await increasePricesGlobally({ percent, applyOn, roundToInteger, categoryIds, tagIds, categoryNameIncludes, tagNameIncludes });
    return { ok: true, ...result, percent, applyOn };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}