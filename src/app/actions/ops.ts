"use server";
import { listAllProducts, updateProduct } from "@/lib/woocommerce";

export type PriceOpsOptions = {
  percent: number; // e.g. 20
  applyOn?: "regular" | "sale" | "both";
  roundToInteger?: boolean;
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
  await increasePricesGlobally({ percent, applyOn, roundToInteger });
}