"use server";
import { parseXmlProducts } from "@/lib/xml";
import { createProduct, updateProduct, deleteProduct, listAllProducts, getProductBySku } from "@/lib/woocommerce";

export type SyncOptions = {
  deleteMissing?: boolean;
};

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

  // Eklemek/güncellemek
  for (const prod of toImport) {
    try {
      const current = existingBySku.get(prod.sku);
      const payload = {
        name: prod.name,
        description: prod.description,
        short_description: prod.short_description,
        regular_price: prod.regular_price,
        sale_price: prod.sale_price,
        sku: prod.sku,
        manage_stock: prod.manage_stock ?? false,
        stock_quantity: prod.stock_quantity,
        status: prod.status ?? "publish",
        images: prod.images,
        // Kategori eşleme gerektirebilir; basit kullanım için şimdilik atlanabilir
      };

      if (current?.id) {
        await updateProduct(current.id, payload);
        updated++;
      } else {
        await createProduct(payload);
        created++;
      }
    } catch (e: any) {
      console.error("Ürün işlenirken hata:", prod.sku, e?.message || e);
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
          }
        } catch (e: any) {
          console.error("Silme hatası:", p.id, e?.message || e);
        }
      }
    }
  }

  return { created, updated, deleted, total: toImport.length };
}