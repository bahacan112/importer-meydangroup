import { NextRequest } from "next/server";
import {
  fetchNewSystemProducts,
  mapNewSystemToProducts,
} from "@/lib/newSystem";
import {
  listAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/woocommerce";

export const runtime = "nodejs";

type SyncOptions = {
  deleteMissing?: boolean;
  doCreateNew?: boolean;
  doUpdateExisting?: boolean;
  updateStockOnly?: boolean;
  updateImagesOnUpdate?: boolean;
  profitMarginPercent?: number; // %
  applyMarginOn?: "regular" | "sale" | "both";
  roundToInteger?: boolean;
};

function line(obj: any) {
  return JSON.stringify(obj) + "\n";
}

export async function POST(req: NextRequest) {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  const startTs = Date.now();

  async function write(obj: any) {
    try {
      await writer.write(encoder.encode(line(obj)));
    } catch {}
  }

  (async () => {
    try {
      const formData = await req.formData();
      const apiUrl = String(formData.get("api_url") || "");
      const imageBaseUrl = String(formData.get("image_base_url") || "");
      const options: SyncOptions = {
        deleteMissing: !!formData.get("deleteMissing"),
        doCreateNew: !!formData.get("doCreateNew"),
        doUpdateExisting: !!formData.get("doUpdateExisting"),
        updateStockOnly: !!formData.get("updateStockOnly"),
        updateImagesOnUpdate: formData.get("updateImagesOnUpdate") ? true : false,
        profitMarginPercent: formData.get("profitMarginPercent") ? Number(formData.get("profitMarginPercent")) : undefined,
        applyMarginOn: (formData.get("applyMarginOn")?.toString() as any) || undefined,
        roundToInteger: formData.get("roundToInteger") ? true : false,
      };

      if (!apiUrl) throw new Error("API URL gerekli");
      await write({ type: "start", at: startTs, message: "Senkronizasyon başlatıldı" });
      const raw = await fetchNewSystemProducts(apiUrl);
      const toImport = mapNewSystemToProducts(raw, imageBaseUrl);
      await write({ type: "info", message: `Toplam içe aktarılacak: ${toImport.length}` });
      const existing = await listAllProducts();
      const existingBySku = new Map<string, { id: number } & any>();
      existing.forEach((p) => { if (p.sku) existingBySku.set(p.sku, p as any); });

      let created = 0;
      let updated = 0;
      let deleted = 0;
      let processed = 0;

      const factor = 1 + ((options.profitMarginPercent || 0) / 100);
      const applyMarginOn = options.applyMarginOn || "regular";
      const roundToInteger = options.roundToInteger ?? true;
      const updateStockOnly = !!options.updateStockOnly;
      const doCreateNew = options.doCreateNew ?? true;
      const doUpdateExisting = options.doUpdateExisting ?? true;

      const applyMargin = (value?: string) => {
        if (!value) return undefined;
        const n = parseFloat(String(value));
        if (Number.isNaN(n)) return value;
        let v = n * factor;
        return roundToInteger ? String(Math.round(v)) : v.toFixed(2);
      };

      for (const prod of toImport) {
        try {
          const current = existingBySku.get(prod.sku);
          // Kar oranı uygula
          let regular_price = prod.regular_price;
          let sale_price = prod.sale_price;
          if (applyMarginOn === "regular") {
            regular_price = applyMargin(regular_price) ?? regular_price;
          } else if (applyMarginOn === "sale") {
            sale_price = applyMargin(sale_price) ?? sale_price;
          } else {
            regular_price = applyMargin(regular_price) ?? regular_price;
            sale_price = applyMargin(sale_price) ?? sale_price;
          }

          if (current?.id) {
            if (!doUpdateExisting) {
              await write({ type: "skip_update", sku: prod.sku, name: prod.name });
            } else if (updateStockOnly) {
              const payloadStock: any = {
                manage_stock: prod.manage_stock ?? false,
                stock_quantity: prod.stock_quantity,
              };
              await updateProduct(current.id, payloadStock);
              updated++;
              await write({ type: "updated_stock", sku: prod.sku, id: current.id, name: prod.name });
            } else {
              const payload: any = {
                name: prod.name,
                description: prod.description,
                short_description: prod.short_description,
                regular_price,
                sale_price,
                sku: prod.sku,
                manage_stock: prod.manage_stock ?? false,
                stock_quantity: prod.stock_quantity,
                status: prod.status ?? "publish",
                images: prod.images,
                categories: prod.categories,
              };
              if (options.updateImagesOnUpdate === false) delete payload.images;
              await updateProduct(current.id, payload);
              updated++;
              await write({ type: "updated_product", sku: prod.sku, id: current.id, name: prod.name });
            }
          } else {
            if (updateStockOnly || !doCreateNew) {
              await write({ type: "skip_create", sku: prod.sku, name: prod.name });
            } else {
              const payloadCreate: any = {
                name: prod.name,
                type: "simple",
                description: prod.description,
                short_description: prod.short_description,
                regular_price,
                sale_price,
                sku: prod.sku,
                manage_stock: prod.manage_stock ?? false,
                stock_quantity: prod.stock_quantity,
                status: prod.status ?? "publish",
                images: prod.images,
                categories: prod.categories,
              };
              await createProduct(payloadCreate);
              created++;
              await write({ type: "created_product", sku: prod.sku, name: prod.name });
            }
          }
          processed++;
          const elapsedMs = Date.now() - startTs;
          const speed = elapsedMs > 0 ? (processed / (elapsedMs / 1000)) : 0;
          await write({ type: "progress", processed, total: toImport.length, elapsedMs, speed });
        } catch (e: any) {
          await write({ type: "error", sku: prod.sku, name: prod.name, error: e?.message || String(e) });
        }
      }

      if (options.deleteMissing) {
        const importSkus = new Set(toImport.map((p) => p.sku));
        for (const p of existing) {
          if (!p.sku) continue;
          if (!importSkus.has(p.sku)) {
            try {
              if (p.id) {
                await deleteProduct(p.id);
                deleted++;
                await write({ type: "deleted_missing", id: p.id, sku: p.sku, name: p.name });
              }
            } catch (e: any) {
              await write({ type: "error", sku: p.sku, name: p.name, error: e?.message || String(e) });
            }
          }
        }
      }

      await write({ type: "done", created, updated, deleted, total: toImport.length });
    } catch (err: any) {
      await write({ type: "fatal", message: String(err?.message || err) });
    } finally {
      try { await writer.close(); } catch {}
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store, max-age=0",
    },
  });
}