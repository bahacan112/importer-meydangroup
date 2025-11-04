import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  listAllProducts,
  deleteProduct,
  listAllCategories,
  deleteCategory,
  WooProduct,
  WooCategory,
} from "@/lib/woocommerce";

export const runtime = "nodejs";

function line(obj: any) {
  return JSON.stringify(obj) + "\n";
}

export async function POST(_req: NextRequest) {
  const ts = Date.now();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  const baseUrl = process.env.WOOCOMMERCE_URL || "";

  // Log dosyası hazırlığı
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "delete-all");
  await fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});
  const dt = new Date(ts);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");
  const logName = `delete-all-${y}${m}${d}-${hh}${mm}${ss}.jsonl`;
  const logAbs = path.join(uploadsDir, logName);
  const publicLogPath = path.join("uploads", "delete-all", logName).replace(/\\/g, "/");

  async function safeWrite(obj: any) {
    try {
      const txt = line(obj);
      await writer.write(encoder.encode(txt));
      // Dosyaya da ekle (JSONL)
      await fs.appendFile(logAbs, txt).catch(() => {});
    } catch (e) {
      // ignore write errors
    }
  }

  (async () => {
    await safeWrite({ type: "start", at: ts, message: "Silme işlemi başlatıldı" });
    await safeWrite({ type: "context", store: baseUrl });
    await safeWrite({ type: "saved_file", file: publicLogPath });
    try {
      // Ürünleri listele ve sil
      const products: WooProduct[] = await listAllProducts();
      await safeWrite({ type: "info", message: `Toplam ürün: ${products.length}` });
      for (const p of products) {
        const id = p.id!;
        try {
          await deleteProduct(id);
          await safeWrite({ type: "deleted_product", id, name: p.name, sku: p.sku });
        } catch (err: any) {
          await safeWrite({ type: "error", scope: "product", id, name: p.name, error: String(err?.message || err) });
        }
      }

      // Kategorileri listele ve sil
      const categories: WooCategory[] = await listAllCategories();
      await safeWrite({ type: "info", message: `Toplam kategori: ${categories.length}` });
      for (const c of categories) {
        const id = c.id!;
        try {
          await deleteCategory(id);
          await safeWrite({ type: "deleted_category", id, name: c.name });
        } catch (err: any) {
          await safeWrite({ type: "error", scope: "category", id, name: c.name, error: String(err?.message || err) });
        }
      }

      await safeWrite({ type: "done", message: "Silme işlemi tamamlandı" });
    } catch (err: any) {
      await safeWrite({ type: "fatal", message: String(err?.message || err) });
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