"use server";
import { parseXmlProducts } from "@/lib/xml";
import { createProduct, updateProduct, deleteProduct, listAllProducts } from "@/lib/woocommerce";
import fs from "node:fs/promises";
import path from "node:path";

export type SyncOptions = {
  deleteMissing?: boolean;
  onlyCreateNew?: boolean;
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

const REPORT_PATH = path.join(process.cwd(), "sync-report.json");

export async function previewXml(xmlPath?: string) {
  const path = xmlPath || process.env.XML_PATH || "";
  const products = parseXmlProducts(path);
  return products.slice(0, 200); // UI’de ilk 200 kaydı göster
}

export async function runSync(xmlPath?: string, options: SyncOptions = {}) {
  const path = xmlPath || process.env.XML_PATH || "";
  const toImport = parseXmlProducts(path);
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
        // Kategori eşleme gerektirebilir; basit kullanım için şimdilik atlanabilir
      };

      if (current?.id) {
        if (!options.onlyCreateNew) {
          // Görsel güncelleme kapalıysa mevcut ürün güncellemesinde images alanını kaldır
          if (options.updateImagesOnUpdate === false) {
            delete payload.images;
          }
          await updateProduct(current.id, payload);
          updated++;
          updatedSkus.push(prod.sku);
        }
      } else {
        await createProduct(payload);
        created++;
        createdSkus.push(prod.sku);
      }
    } catch (e: any) {
      console.error("Ürün işlenirken hata:", prod.sku, e?.message || e);
      errors.push({ sku: prod.sku, message: e?.message || String(e) });
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
            deletedSkus.push(p.sku);
          }
        } catch (e: any) {
          console.error("Silme hatası:", p.id, e?.message || e);
          errors.push({ sku: p.sku, message: e?.message || String(e) });
        }
      }
    }
  }

  const report: SyncReport = { created, updated, deleted, total: toImport.length, createdSkus, updatedSkus, deletedSkus, errors };
  try {
    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  } catch (e) {
    console.error("Rapor yazılamadı:", e);
  }
  return report;
}

export async function getLastReport(): Promise<SyncReport> {
  try {
    const buf = await fs.readFile(REPORT_PATH, "utf8");
    return JSON.parse(buf);
  } catch {
    return { created: 0, updated: 0, deleted: 0, total: 0, createdSkus: [], updatedSkus: [], deletedSkus: [], errors: [] };
  }
}