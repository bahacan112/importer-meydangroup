import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  fetchNewSystemProducts,
  mapNewSystemToProducts,
  NewSystemProductSchema,
} from "@/lib/newSystem";
import {
  listAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductBySku,
  listAllCategories,
  createCategory,
  listAllTags,
  createTag,
} from "@/lib/woocommerce";

export const runtime = "nodejs";

type SyncOptions = {
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
      const filePath = String(formData.get("file_path") || "");
      const options: SyncOptions = {
        deleteMissing: !!formData.get("deleteMissing"),
        doCreateNew: !!formData.get("doCreateNew"),
        doUpdateExisting: !!formData.get("doUpdateExisting"),
        updateStockOnly: !!formData.get("updateStockOnly"), // backward compatibility
        updateStockAndPriceOnly: !!formData.get("updateStockAndPriceOnly"),
        updateImagesOnUpdate: formData.get("updateImagesOnUpdate") ? true : false,
        profitMarginPercent: formData.get("profitMarginPercent") ? Number(formData.get("profitMarginPercent")) : undefined,
        applyMarginOn: (formData.get("applyMarginOn")?.toString() as any) || undefined,
        roundToInteger: formData.get("roundToInteger") ? true : false,
      };
      await write({ type: "start", at: startTs, message: "Senkronizasyon başlatıldı" });

      // JSON kaydetme için dizini hazırla
      const uploadsDir = path.join(process.cwd(), "public", "uploads", "new-system");
      await fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});

      let raw: any[] = [];
      let savedFilename: string | undefined;

      if (filePath) {
        // Dosyadan çalış
        const safeRel = filePath.replace(/^\\+|^\/+/, "");
        const absolute = path.join(process.cwd(), "public", safeRel);
        const data = await fs.readFile(absolute, "utf-8");
        raw = JSON.parse(data);
        await write({ type: "info", message: `Dosyadan senkronizasyon: ${safeRel}` });
      } else {
        // API'den çek, önce JSON'a kaydet
        if (!apiUrl) throw new Error("API URL gerekli");
        raw = await fetchNewSystemProducts(apiUrl);
        const ts = new Date();
        const y = ts.getFullYear();
        const m = String(ts.getMonth() + 1).padStart(2, "0");
        const d = String(ts.getDate()).padStart(2, "0");
        const hh = String(ts.getHours()).padStart(2, "0");
        const mm = String(ts.getMinutes()).padStart(2, "0");
        const ss = String(ts.getSeconds()).padStart(2, "0");
        const filename = `new-system-${y}${m}${d}-${hh}${mm}${ss}.json`;
        const abs = path.join(uploadsDir, filename);
        await fs.writeFile(abs, JSON.stringify(raw, null, 2), "utf-8");
        savedFilename = path.join("uploads", "new-system", filename).replace(/\\/g, "/");

        // Eski JSON'ları sil (aynı klasördeki .json dosyaları)
        try {
          const entries = await fs.readdir(uploadsDir, { withFileTypes: true });
          for (const e of entries) {
            if (e.isFile() && e.name.endsWith(".json") && e.name !== filename) {
              await fs.unlink(path.join(uploadsDir, e.name)).catch(() => {});
            }
          }
        } catch {}

        await write({ type: "saved_file", file: savedFilename, count: raw.length });
      }

      // Dosyadan okunmuş veriyi de şema ile doğrula; geçersiz kayıtları dışla
      let validRaw: any[] = [];
      try {
        validRaw = (raw || [])
          .map((p) => {
            const parsed = NewSystemProductSchema.safeParse(p);
            return parsed.success ? parsed.data : null;
          })
          .filter((x) => !!x);
        await write({
          type: "info",
          message: `Dosya kayıtları: ${raw?.length || 0}, Geçerli: ${validRaw.length}, Geçersiz: ${(raw?.length || 0) - validRaw.length}`,
        });
      } catch {}

      const toImportAll = mapNewSystemToProducts(validRaw.length ? validRaw : raw, imageBaseUrl);
      // Yinelenen SKU’ları tekilleştirerek concurrent create denemelerini önle
      const seen = new Set<string>();
      const toImport = toImportAll.filter((p) => {
        if (!p.sku) return false;
        const key = String(p.sku);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      await write({ type: "info", message: `Toplam içe aktarılacak: ${toImport.length}` });
      const existing = await listAllProducts();
      const existingBySku = new Map<string, { id: number } & any>();
      existing.forEach((p) => { if (p.sku) existingBySku.set(p.sku, p as any); });

      // Kategori hiyerarşisini kurmak için mevcut kategorileri çek ve isim+ebeveyn eşleşmesi ile haritalandır
      const existingCats = await listAllCategories();
      const norm = (s?: string) => (s || "").trim().toLowerCase();
      const catKey = (parentId: number | undefined, name: string) => `${parentId || 0}::${norm(name)}`;
  const catMap = new Map<string, number>();
  for (const c of existingCats) {
    if (!c.name) continue;
    catMap.set(catKey(c.parent, c.name), c.id!);
  }
  // Tag haritası
  const existingTags = await listAllTags();
  const tagNorm = (s?: string) => (s || "").trim().toLowerCase();
  const tagMap = new Map<string, number>();
  for (const t of existingTags) {
    if (!t.name) continue;
    tagMap.set(tagNorm(t.name), t.id!);
  }

      // Hız için raw veriyi SKU ile eşleştir
      const rawBySku = new Map<string, any>();
      (validRaw.length ? validRaw : raw).forEach((r: any) => {
        if (r && r.KOD) rawBySku.set(String(r.KOD), r);
      });

  async function ensureCategoryChain(names: string[]): Promise<number[]> {
    const ids: number[] = [];
    let parentId: number | undefined = undefined;
    for (const name of names) {
      const n = name?.trim();
      if (!n) continue;
      const key = catKey(parentId, n);
      let id = catMap.get(key);
      if (!id) {
        try {
          const created = await createCategory({ name: n, parent: parentId });
          id = created.id!;
          catMap.set(key, id);
          await write({ type: "category_created", name: n, parent: parentId || 0, id });
        } catch (e: any) {
          await write({ type: "error", error: `Kategori oluşturulamadı: ${n} - ${e?.message || e}` });
          // Kategori olmadan devam edelim
          continue;
        }
      }
      ids.push(id as number);
      parentId = id as number;
    }
    return ids;
  }

  async function ensureTags(names: string[]): Promise<number[]> {
    const ids: number[] = [];
    for (const name of names) {
      const n = name?.trim();
      if (!n) continue;
      const key = tagNorm(n);
      let id = tagMap.get(key);
      if (!id) {
        try {
          const created = await createTag({ name: n });
          id = created.id!;
          tagMap.set(key, id);
          await write({ type: "tag_created", name: n, id });
        } catch (e: any) {
          await write({ type: "error", error: `Tag oluşturulamadı: ${n} - ${e?.message || e}` });
          continue;
        }
      }
      ids.push(id as number);
    }
    return ids;
  }

      let created = 0;
      let updated = 0;
      let deleted = 0;
      let processed = 0;

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

      const sanitizeImages = (images?: { src: string }[]) => {
        if (!images || images.length === 0) return undefined;
        const cleaned = images
          .filter((i) => i && typeof i.src === "string" && /^https?:\/\//i.test(i.src))
          .filter((i) => {
            try {
              const u = new URL(i.src);
              const pathname = (u.pathname || "").trim();
              if (!pathname || pathname === "/" || pathname.endsWith("/")) return false;
              const base = pathname.split("/").pop() || "";
              // En azından bir dosya adı var mı? ve tipik uzantı kontrolü
              const hasExt = /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(base);
              return base.length > 1 && (hasExt || base.includes("."));
            } catch {
              return false;
            }
          });
        return cleaned.length > 0 ? cleaned : undefined;
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
              // Varsayılan davranış: mevcut üründe sadece stok ve fiyat güncelle
              const payloadSP: any = {
                regular_price,
                sale_price,
                manage_stock: prod.manage_stock ?? false,
                stock_quantity: prod.stock_quantity,
              };
              await updateProduct(current.id, payloadSP);
              updated++;
              await write({ type: "updated_stock_price", sku: prod.sku, id: current.id, name: prod.name });
            }
          } else {
            if (updateStockOnly || updateStockAndPriceOnly || !doCreateNew) {
              await write({ type: "skip_create", sku: prod.sku, name: prod.name });
            } else {
              const rawItem = rawBySku.get(prod.sku);
              // Kullanıcı talebi: kategori zinciri MARKA > MODEL > ALT_GRUP
              const chain = [rawItem?.MARKA, rawItem?.MODEL, rawItem?.ALT_GRUP]
                .map((x: any) => (x ? String(x) : ""));
              const catIds = await ensureCategoryChain(chain);
              const tagNames = [rawItem?.OEM, rawItem?.MARKA, rawItem?.MODEL, rawItem?.STOK_ADI]
                .map((x: any) => (x ? String(x) : ""));
              const tagIds = await ensureTags(tagNames);
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
                images: sanitizeImages(prod.images),
                categories: catIds.length ? catIds.map((id) => ({ id })) : undefined,
                tags: tagIds.length ? tagIds.map((id) => ({ id })) : undefined,
              };
              if (!payloadCreate.images) delete payloadCreate.images;
              let createdProd;
              try {
                createdProd = await createProduct(payloadCreate);
              } catch (e: any) {
                const emsg = e?.message || String(e);
                if (payloadCreate.images && /image|görsel|media|forbidden|upload/i.test(emsg)) {
                  const withoutImages = { ...payloadCreate };
                  delete withoutImages.images;
                  await write({ type: "image_upload_failed", sku: prod.sku, error: emsg });
                  createdProd = await createProduct(withoutImages);
                } else if (/already|i\u015fleniyor|processing/i.test(emsg)) {
                  // WooCommerce aynı SKU için create işlemini arka planda yürütüyor olabilir.
                  // Ürün oluşmuşsa stok/fiyat güncelleyip devam edelim; oluşmadıysa çakışmayı raporlayıp sonraki ürüne geçelim.
                  try {
                    const maybe = await getProductBySku(prod.sku);
                    if (maybe?.id) {
                      existingBySku.set(prod.sku, { id: maybe.id, sku: prod.sku } as any);
                      const payloadSP: any = {
                        regular_price,
                        sale_price,
                        manage_stock: prod.manage_stock ?? false,
                        stock_quantity: prod.stock_quantity,
                      };
                      await updateProduct(maybe.id, payloadSP);
                      await write({ type: "updated_stock_price", sku: prod.sku, id: maybe.id, name: prod.name });
                      createdProd = maybe as any;
                    } else {
                      await write({ type: "skip_conflict", sku: prod.sku, name: prod.name, error: emsg });
                    }
                  } catch (err: any) {
                    await write({ type: "skip_conflict", sku: prod.sku, name: prod.name, error: emsg });
                  }
                } else {
                  throw e;
                }
              }
              if (createdProd?.id) {
                existingBySku.set(prod.sku, { id: createdProd.id, sku: prod.sku } as any);
              }
              created++;
              await write({ type: "created_product", sku: prod.sku, name: prod.name });
            }
          }
          processed++;
          const elapsedMs = Date.now() - startTs;
          const speed = elapsedMs > 0 ? (processed / (elapsedMs / 1000)) : 0;
          await write({ type: "progress", processed, total: toImport.length, elapsedMs, speed });
        } catch (e: any) {
          const msg = e?.message || String(e);
          // Woo özel hata: "stok kodu ... zaten işleniyor" durumunda create çakışması var; uyarı verip devam edelim
          if (msg.includes("zaten i") || msg.toLowerCase().includes("processing")) {
            await write({ type: "skip_conflict", sku: prod.sku, name: prod.name, error: msg });
          } else {
            await write({ type: "error", sku: prod.sku, name: prod.name, error: msg });
          }
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

      await write({ type: "done", created, updated, deleted, total: toImport.length, file: savedFilename });
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