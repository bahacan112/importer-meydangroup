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
  findMediaByFilename,
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
  mediaMode?: "upload" | "prefer_existing_by_filename" | "none";
  limit?: number;
  perItemDelayMs?: number;
  processDirection?: "asc" | "desc"; // dosya başından mı sonundan mı?
};

function line(obj: any) {
  return JSON.stringify(obj) + "\n";
}

// Çakışma tespiti (SKU zaten işlemde/in-progress)
function isProcessingConflict(msg: string) {
  const m = String(msg || "").toLowerCase();
  // Bazı hata metinleri JSON içinde unicode escape ile gelebilir: i\u015fleniyor
  return /already|işleniyor|i\\u015fleniyor|processing|claimed|in-progress|zaten/.test(m);
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
      // Manuel tek ürün test modu için alanlar
      const manualSku = String(formData.get("manualSku") || "");
      const manualName = formData.get("manualName") ? String(formData.get("manualName")) : undefined;
      const manualRegularPrice = formData.get("manualRegularPrice") ? String(formData.get("manualRegularPrice")) : undefined;
      const manualSalePrice = formData.get("manualSalePrice") ? String(formData.get("manualSalePrice")) : undefined;
      const manualStockQuantityRaw = formData.get("manualStockQuantity");
      const manualStockQuantity = manualStockQuantityRaw != null ? Number(String(manualStockQuantityRaw)) : undefined;
      const manualManageStock = formData.get("manualManageStock") ? true : undefined;
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
        mediaMode: (formData.get("mediaMode")?.toString() as any) || "prefer_existing_by_filename",
        limit: formData.get("limit") ? Number(formData.get("limit")) : undefined,
        perItemDelayMs: formData.get("perItemDelayMs") ? Number(formData.get("perItemDelayMs")) : undefined,
        processDirection: (formData.get("processDirection")?.toString().toLowerCase() as any) || "asc",
      };
      await write({ type: "start", at: startTs, message: "Senkronizasyon başlatıldı" });
      // Teşhis: WooCommerce base URL'i logla (anahtarı/sırrı loglamıyoruz)
      try {
        const wooUrl = process.env.WOOCOMMERCE_URL || "";
        await write({ type: "woo_config", baseUrl: wooUrl || "(tanımsız)" });
      } catch {}

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

      // Eğer manuel tek ürün istendiyse, girişlerden tek ürün oluştur
      let toImportAll = manualSku
        ? [{
            sku: manualSku,
            name: manualName || manualSku,
            description: undefined,
            short_description: undefined,
            regular_price: manualRegularPrice,
            sale_price: manualSalePrice,
            stock_quantity: (manualStockQuantity !== undefined && !Number.isNaN(manualStockQuantity)) ? manualStockQuantity : undefined,
            manage_stock: manualManageStock ?? ((manualStockQuantity !== undefined && !Number.isNaN(manualStockQuantity)) ? true : undefined),
            status: "publish",
            images: undefined,
            categories: undefined,
            tags: undefined,
          }]
        : mapNewSystemToProducts(validRaw.length ? validRaw : raw, imageBaseUrl);
      if (manualSku) {
        await write({ type: "info", message: "Manuel tek ürün testi", sku: manualSku });
      }
      // İstenirse dosyanın sonundan başlayarak işle (desc)
      if ((options.processDirection || "asc") === "desc") {
        toImportAll = toImportAll.reverse();
        await write({ type: "order_applied", direction: "desc" });
      } else {
        await write({ type: "order_applied", direction: "asc" });
      }
      // Yinelenen SKU’ları tekilleştirerek concurrent create denemelerini önle
      const seen = new Set<string>();
      let toImport = toImportAll.filter((p) => {
        if (!p.sku) return false;
        const key = String(p.sku);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (options.limit && options.limit > 0) {
        toImport = toImport.slice(0, options.limit);
        await write({ type: "limit_applied", limit: options.limit, effective: toImport.length });
      }
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

      // Tag isimlerini güvenli ve sınırlı tutmak için basit filtre
      function sanitizeTagNames(names: string[]): string[] {
        const out: string[] = [];
        const seen = new Set<string>();
        for (const name of names) {
          const n = (name || "").trim();
          if (!n) continue;
          // Çok uzun etiketleri ve aşırı kelimeli etiketleri atla
          if (n.length > 40) continue;
          if (n.split(/\s+/).length > 6) continue;
          const key = n.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(n);
          if (out.length >= 5) break; // Ürün başına üst sınır
        }
        return out;
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
      const deferredCreates: {
        sku: string;
        name: string;
        payload: any;
        regular_price?: string;
        sale_price?: string;
        stock_quantity?: number;
        manage_stock?: boolean;
      }[] = [];

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

      // Mevcut medya varsa dosya adına göre tercih et
      const basenameIdCache = new Map<string, number>();
      async function resolveImages(images?: { src: string }[], mode: "upload" | "prefer_existing_by_filename" | "none" = "prefer_existing_by_filename") {
        if (!images || images.length === 0) return undefined;
        if (mode === "none") return undefined;
        const cleaned = sanitizeImages(images);
        if (!cleaned) return undefined;
        if (mode === "upload") return cleaned;
        const out: ({ id: number } | { src: string })[] = [];
        for (const img of cleaned) {
          try {
            const u = new URL(img.src);
            const base = u.pathname.split("/").pop() || "";
            if (basenameIdCache.has(base)) {
              const id = basenameIdCache.get(base)!;
              out.push({ id });
              await write({ type: "found_existing_media_cached", basename: base, id });
              continue;
            }
            const found = await findMediaByFilename(base);
            if (found?.id) {
              basenameIdCache.set(base, found.id);
              out.push({ id: found.id });
              await write({ type: "found_existing_media", basename: base, id: found.id });
            } else {
              out.push({ src: img.src });
              await write({ type: "fallback_upload_media", basename: base, src: img.src });
            }
          } catch {
            out.push({ src: img.src });
          }
        }
        return out.length ? out : undefined;
      }

      for (const prod of toImport) {
        if (options.perItemDelayMs && options.perItemDelayMs > 0) {
          await new Promise((r) => setTimeout(r, options.perItemDelayMs));
        }
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
              const payloadStock: any = {};
              if (prod.manage_stock !== undefined) payloadStock.manage_stock = prod.manage_stock;
              if (prod.stock_quantity !== undefined) payloadStock.stock_quantity = prod.stock_quantity;
              if (Object.keys(payloadStock).length > 0) {
                await updateProduct(current.id, payloadStock);
                updated++;
                await write({ type: "updated_stock", sku: prod.sku, id: current.id, name: prod.name });
              } else {
                await write({ type: "skip_update_no_fields", sku: prod.sku, id: current.id, name: prod.name });
              }
            } else {
              // Varsayılan davranış: mevcut üründe sadece stok ve fiyat güncelle
              const payloadSP: any = {};
              if (regular_price !== undefined) payloadSP.regular_price = regular_price;
              if (sale_price !== undefined) payloadSP.sale_price = sale_price;
              if (prod.manage_stock !== undefined) payloadSP.manage_stock = prod.manage_stock;
              if (prod.stock_quantity !== undefined) payloadSP.stock_quantity = prod.stock_quantity;
              if (Object.keys(payloadSP).length > 0) {
                await updateProduct(current.id, payloadSP);
                updated++;
                await write({ type: "updated_stock_price", sku: prod.sku, id: current.id, name: prod.name });
              } else {
                await write({ type: "skip_update_no_fields", sku: prod.sku, id: current.id, name: prod.name });
              }
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
              const tagNames = sanitizeTagNames([
                rawItem?.OEM,
                rawItem?.MARKA,
                rawItem?.MODEL,
                // Ürün adına göre otomatik tag oluşturmayı kapattık (çok uzun ve benzersiz isimler oluşturuyor)
              ].map((x: any) => (x ? String(x) : "")));
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
                images: await resolveImages(prod.images as any, options.mediaMode || "prefer_existing_by_filename"),
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
                } else if (isProcessingConflict(emsg)) {
                  // WooCommerce aynı SKU için create işlemini arka planda yürütüyor olabilir.
                  // Ürün oluşmuşsa stok/fiyat güncelleyip devam edelim; oluşmadıysa çakışmayı raporlayıp sonraki ürüne geçelim.
                  try {
                    const maybe = await getProductBySku(prod.sku);
                    if (maybe?.id) {
                      existingBySku.set(prod.sku, { id: maybe.id, sku: prod.sku } as any);
                      const payloadSP: any = {};
                      if (regular_price !== undefined) payloadSP.regular_price = regular_price;
                      if (sale_price !== undefined) payloadSP.sale_price = sale_price;
                      if (prod.manage_stock !== undefined) payloadSP.manage_stock = prod.manage_stock;
                      if (prod.stock_quantity !== undefined) payloadSP.stock_quantity = prod.stock_quantity;
                      await updateProduct(maybe.id, payloadSP);
                      await write({ type: "updated_stock_price", sku: prod.sku, id: maybe.id, name: prod.name });
                      createdProd = maybe as any;
                    } else {
                      // Kısa bir bekleme sonrası tek seferlik yeniden dene (görselsiz) 
                      await new Promise((r) => setTimeout(r, 500));
                      try {
                        const withoutImages = { ...payloadCreate };
                        delete withoutImages.images;
                        createdProd = await createProduct(withoutImages);
                      } catch (e2: any) {
                        await write({ type: "skip_conflict", sku: prod.sku, name: prod.name, error: emsg });
                        // İkinci tur için ertele
                        deferredCreates.push({
                          sku: prod.sku,
                          name: prod.name,
                          payload: payloadCreate,
                          regular_price,
                          sale_price,
                          stock_quantity: prod.stock_quantity,
                          manage_stock: prod.manage_stock ?? false,
                        });
                      }
                    }
                  } catch (err: any) {
                    await write({ type: "skip_conflict", sku: prod.sku, name: prod.name, error: emsg });
                    deferredCreates.push({
                      sku: prod.sku,
                      name: prod.name,
                      payload: payloadCreate,
                      regular_price,
                      sale_price,
                      stock_quantity: prod.stock_quantity,
                      manage_stock: prod.manage_stock ?? false,
                    });
                  }
                } else {
                  throw e;
                }
              }
              if (createdProd?.id) {
                existingBySku.set(prod.sku, { id: createdProd.id, sku: prod.sku } as any);
                created++;
                await write({ type: "created_product", sku: prod.sku, id: createdProd.id, name: prod.name });
              }
            }
          }
          processed++;
          const elapsedMs = Date.now() - startTs;
          const speed = elapsedMs > 0 ? (processed / (elapsedMs / 1000)) : 0;
          await write({ type: "progress", processed, total: toImport.length, elapsedMs, speed });
        } catch (e: any) {
          const msg = e?.message || String(e);
          // Woo özel hata: "stok kodu ... zaten işleniyor" durumunda create çakışması var; uyarı verip devam edelim
          if (isProcessingConflict(msg)) {
            await write({ type: "skip_conflict", sku: prod.sku, name: prod.name, error: msg });
          } else {
            await write({ type: "error", sku: prod.sku, name: prod.name, error: msg });
          }
        }
      }

      // Ertelenen create denemeleri: ikinci turda daha uzun beklemeli ve birkaç kez deneyerek işle
      const deferredBaseWaitMs = 2000; // WooCommerce'in SKU işleme kuyrukları için daha geniş bekleme
      const deferredMaxAttempts = 4;   // En fazla 4 deneme (toplam ~15s bekleme ile)
      for (const item of deferredCreates) {
        try {
          let attempt = 0;
          let done = false;
          while (!done && attempt < deferredMaxAttempts) {
            attempt++;
            // Her deneme öncesi artan bekleme (exponential backoff)
            const waitMs = deferredBaseWaitMs * Math.pow(2, attempt - 1);
            await new Promise((r) => setTimeout(r, waitMs));
            const maybe = await getProductBySku(item.sku);
            if (maybe?.id) {
              const payloadSP: any = {
                regular_price: item.regular_price,
                sale_price: item.sale_price,
                manage_stock: item.manage_stock ?? false,
                stock_quantity: item.stock_quantity,
              };
              await updateProduct(maybe.id, payloadSP);
              await write({ type: "updated_stock_price_deferred", sku: item.sku, id: maybe.id, name: item.name });
              done = true;
              break;
            }
            const withoutImages = { ...item.payload };
            delete withoutImages.images;
            try {
              const createdDeferred = await createProduct(withoutImages);
              if (createdDeferred?.id) {
                existingBySku.set(item.sku, { id: createdDeferred.id, sku: item.sku } as any);
                created++;
                await write({ type: "created_product_deferred", sku: item.sku, name: item.name });
                done = true;
                break;
              }
            } catch (e2: any) {
              const msg2 = e2?.message || String(e2);
              // "zaten işleniyor" türü hatalarda bir sonraki denemeye geç, diğer hatalarda bırak
              if (isProcessingConflict(msg2)) {
                await write({ type: "retry_conflict_deferred", sku: item.sku, name: item.name, attempt, waitMs, error: msg2 });
                continue;
              } else {
                await write({ type: "skip_conflict_deferred", sku: item.sku, name: item.name, error: msg2 });
                break;
              }
            }
          }
          if (!done) {
            await write({ type: "giveup_deferred", sku: item.sku, name: item.name, attempts: deferredMaxAttempts });
          }
        } catch (err: any) {
          await write({ type: "error", sku: item.sku, name: item.name, error: err?.message || String(err) });
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