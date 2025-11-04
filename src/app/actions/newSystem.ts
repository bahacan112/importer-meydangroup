"use server";
import { fetchNewSystemProducts, mapNewSystemToProducts } from "@/lib/newSystem";
import { createProduct, updateProduct, deleteProduct, listAllProducts } from "@/lib/woocommerce";
import { getAppSettings, saveAppSettings } from "./settings";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export type SyncOptions = {
  deleteMissing?: boolean;
  doCreateNew?: boolean;
  doUpdateExisting?: boolean;
  updateStockOnly?: boolean; // legacy
  updateStockAndPriceOnly?: boolean;
  updateImagesOnUpdate?: boolean;
  profitMarginPercent?: number; // %
  applyMarginOn?: "regular" | "sale" | "both";
  roundToInteger?: boolean;
};

type SyncReport = {
  created: number;
  updated: number;
  deleted: number;
  total: number;
  createdSkus: string[];
  updatedSkus: string[];
  deletedSkus: string[];
  errors: { sku?: string; message: string }[];
};

const REPORTS_DIR = path.join(process.cwd(), "data", "reports");

async function ensureReportsDir() {
  try {
    await fs.mkdir(REPORTS_DIR, { recursive: true });
  } catch {}
}

export async function previewNewSystemForm(formData: FormData) {
  const api_url = String(formData.get("api_url") || "");
  const image_base_url = String(formData.get("image_base_url") || "");
  if (!api_url) throw new Error("API URL gerekli");
  const raw = await fetchNewSystemProducts(api_url);
  const mapped = mapNewSystemToProducts(raw, image_base_url);
  // İlk 200 kaydı göster
  return mapped.slice(0, 200).map((p) => ({
    sku: p.sku,
    name: p.name,
    regular_price: p.regular_price,
    stock_quantity: p.stock_quantity,
  }));
}

export async function saveNewSystemSettingsForm(formData: FormData) {
  const api_url = String(formData.get("api_url") || "").trim();
  const image_base_url = String(formData.get("image_base_url") || "").trim();
  // Checkbox alanları formda işaretli değilse hiç gönderilmediği için,
  // mevcut değerleri korumak yerine açıkça true/false kaydedelim.
  await saveAppSettings({
    newApiUrl: api_url || undefined,
    newImageBaseUrl: image_base_url || undefined,
    doCreateNew: formData.get("doCreateNew") ? true : false,
    doUpdateExisting: formData.get("doUpdateExisting") ? true : false,
    updateStockAndPriceOnly: formData.get("updateStockAndPriceOnly") ? true : false,
    updateImagesOnUpdate: formData.get("updateImagesOnUpdate") ? true : false,
    profitMarginPercent: Number(formData.get("profitMarginPercent") || 0),
    applyMarginOn: (formData.get("applyMarginOn")?.toString() as any) || "regular",
    roundToInteger: formData.get("roundToInteger") ? true : false,
  });
  return { ok: true };
}

export async function runNewSystemSyncForm(formData: FormData) {
  const api_url = String(formData.get("api_url") || "");
  const image_base_url = String(formData.get("image_base_url") || "");
  const opts: SyncOptions = {
    deleteMissing: !!formData.get("deleteMissing"),
    doCreateNew: !!formData.get("doCreateNew"),
    doUpdateExisting: !!formData.get("doUpdateExisting"),
    updateStockAndPriceOnly: !!formData.get("updateStockAndPriceOnly"),
    updateImagesOnUpdate: formData.get("updateImagesOnUpdate") ? true : false,
    profitMarginPercent: formData.get("profitMarginPercent") ? Number(formData.get("profitMarginPercent")) : undefined,
    applyMarginOn: (formData.get("applyMarginOn")?.toString() as any) || undefined,
    roundToInteger: formData.get("roundToInteger") ? true : false,
  };
  return runNewSystemSync(api_url, image_base_url, opts);
}

export async function runNewSystemSync(apiUrl: string, imageBaseUrl?: string, options: SyncOptions = {}) {
  if (!apiUrl) throw new Error("API URL gerekli");
  const raw = await fetchNewSystemProducts(apiUrl);
  const toImportAll = mapNewSystemToProducts(raw, imageBaseUrl);
  // Aynı SKU birden fazla kez gelirse yinelenen create denemelerini ve çakışmaları önlemek için tekilleştir.
  const seen = new Set<string>();
  const toImport = toImportAll.filter((p) => {
    if (!p.sku) return false;
    const key = String(p.sku);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const existing = await listAllProducts();
  const existingBySku = new Map<string, { id: number } & any>();
  existing.forEach((p) => {
    if (p.sku) existingBySku.set(p.sku, p as any);
  });

  let created = 0;
  let updated = 0;
  let deleted = 0;
  const createdSkus: string[] = [];
  const updatedSkus: string[] = [];
  const deletedSkus: string[] = [];
  const errors: { sku?: string; message: string }[] = [];

  const factor = 1 + ((options.profitMarginPercent || 0) / 100);
  const applyMarginOn = options.applyMarginOn || "regular";
  const roundToInteger = options.roundToInteger ?? true;
  const updateStockOnly = !!options.updateStockOnly;
  const updateStockAndPriceOnly = !!options.updateStockAndPriceOnly;
  const doCreateNew = options.doCreateNew ?? true;
  const doUpdateExisting = options.doUpdateExisting ?? true;

  const applyMargin = (value?: string) => {
    if (!value) return undefined;
    const n = parseFloat(String(value));
    if (Number.isNaN(n)) return value;
    let v = n * factor;
    return roundToInteger ? String(Math.round(v)) : v.toFixed(2);
  };

  // Eklemek/güncellemek
  for (const prod of toImport) {
    try {
      const current = existingBySku.get(prod.sku);
      // Kar oranı uygulaması
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
          continue;
        }
        if (updateStockOnly) {
          const payloadStock: any = {
            manage_stock: prod.manage_stock ?? false,
            stock_quantity: prod.stock_quantity,
          };
          await updateProduct(current.id, payloadStock);
          updated++;
          updatedSkus.push(prod.sku);
        } else if (updateStockAndPriceOnly) {
          const payloadSP: any = {
            regular_price,
            sale_price,
            manage_stock: prod.manage_stock ?? false,
            stock_quantity: prod.stock_quantity,
          };
          await updateProduct(current.id, payloadSP);
          updated++;
          updatedSkus.push(prod.sku);
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
          updatedSkus.push(prod.sku);
        }
      } else {
        if (updateStockOnly || updateStockAndPriceOnly || !doCreateNew) continue;
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
        const createdProd = await createProduct(payload);
        if (createdProd?.id) {
          existingBySku.set(prod.sku, { id: createdProd.id, sku: prod.sku });
        }
        created++;
        createdSkus.push(prod.sku);
      }
    } catch (e: any) {
      errors.push({ sku: prod.sku, message: e?.message || String(e) });
    }
  }

  // XML’de olmayanları sil benzeri: yeni API’de olmayan SKU’ları sil
  if (options.deleteMissing) {
    const newSkus = new Set(toImport.map((p) => p.sku));
    for (const [sku, cur] of existingBySku.entries()) {
      if (!newSkus.has(sku)) {
        try {
          await deleteProduct(cur.id);
          deleted++;
          deletedSkus.push(sku);
        } catch (e: any) {
          errors.push({ sku, message: e?.message || String(e) });
        }
      }
    }
  }

  const report: SyncReport = {
    created,
    updated,
    deleted,
    total: toImport.length,
    createdSkus,
    updatedSkus,
    deletedSkus,
    errors,
  };
  try {
    await ensureReportsDir();
    const latestPath = path.join(REPORTS_DIR, "sync-report-latest.json");
    const filePath = path.join(
      REPORTS_DIR,
      `sync-report-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}.json`
    );
    await fs.writeFile(latestPath, JSON.stringify(report, null, 2), "utf8");
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), "utf8");
  } catch {}
  return report;
}