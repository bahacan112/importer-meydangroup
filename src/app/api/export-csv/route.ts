import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { NewSystemProductSchema, mapNewSystemToProducts } from "@/lib/newSystem";

const ReqSchema = z.object({
  sampleCsvPath: z.string().min(1),
  jsonPath: z.string().min(1),
});

function csvEscape(value: any): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  const needsQuote = /[",\n\r]/.test(s) || s.includes(",");
  s = s.replace(/"/g, '""');
  return needsQuote ? `"${s}"` : s;
}

export async function POST(req: Request) {
  try {
    // Parse multipart/form-data or JSON
    let body: any = {};
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      body = {
        sampleCsvPath: String(fd.get("sampleCsvPath") || ""),
        jsonPath: String(fd.get("jsonPath") || ""),
      };
    } else {
      // fallback: try reading as text and parse
      try { body = JSON.parse(await req.text()); } catch { /* ignore */ }
    }
    const parsedReq = ReqSchema.safeParse(body);
    if (!parsedReq.success) {
      return NextResponse.json({ error: "Geçersiz istek", issues: parsedReq.error.issues }, { status: 400 });
    }
    const { sampleCsvPath, jsonPath } = parsedReq.data;

    const cwd = process.cwd();
    const sampleAbs = path.isAbsolute(sampleCsvPath) ? sampleCsvPath : path.join(cwd, sampleCsvPath);
    const jsonAbs = path.isAbsolute(jsonPath) ? jsonPath : path.join(cwd, jsonPath);

    if (!fs.existsSync(sampleAbs)) {
      return NextResponse.json({ error: `Sample CSV bulunamadı: ${sampleCsvPath}` }, { status: 404 });
    }
    if (!fs.existsSync(jsonAbs)) {
      return NextResponse.json({ error: `JSON kaynak bulunamadı: ${jsonPath}` }, { status: 404 });
    }

    // Read header line from sample CSV
    const sampleStr = fs.readFileSync(sampleAbs, "utf8");
    const firstNl = sampleStr.indexOf("\n");
    const headerLine = firstNl >= 0 ? sampleStr.slice(0, firstNl).trim() : sampleStr.trim();
    const headerCols = headerLine
      .split(",")
      .map((h) => h.trim());

    // Load and validate JSON array of raw products
    const jsonStr = fs.readFileSync(jsonAbs, "utf8");
    let j: any;
    try {
      j = JSON.parse(jsonStr);
    } catch (e: any) {
      return NextResponse.json({ error: `JSON parse hatası: ${e?.message || String(e)}` }, { status: 400 });
    }
    const arr: any[] = Array.isArray(j) ? j : (j?.items || j?.products || j?.data || []);
    const rawProducts = arr
      .map((p) => {
        const parsed = NewSystemProductSchema.safeParse(p);
        return parsed.success ? parsed.data : null;
      })
      .filter((x): x is z.infer<typeof NewSystemProductSchema> => !!x);

    // Map to our internal product shape
    const products = mapNewSystemToProducts(rawProducts);

    // Build rows in the same order as headerCols
    const rows: string[] = [];
    rows.push(headerCols.map((h) => csvEscape(h.replace(/^"|"$/g, ""))).join(","));

    for (const p of products) {
      const cats = (p.categories || []).map((c) => c.name).filter(Boolean);
      const catChain = cats.join(" > ");
      const tags = (p.tags || []).map((t) => t.name).filter(Boolean).join(", ");
      const images = (p.images || []).map((i) => i.src).filter(Boolean).join(", ");
      const published = p.status === "publish" ? "1" : "0";
      const inStock = p.manage_stock ? ((p.stock_quantity || 0) > 0 ? "1" : "0") : ""; // boş bırakılırsa Woo default kullanır

      const colMap: Record<string, string> = {
        "Kimlik": "",
        "Tür": "simple",
        '"Stok kodu (SKU)"': p.sku || "",
        "İsim": p.name || "",
        "Yayımlanmış": published,
        '"Öne çıkan?"': "0",
        '"Katalogda görünürlük"': "visible",
        '"Kısa açıklama"': p.short_description || "",
        "Açıklama": p.description || "",
        '"İndirimli fiyatın başladığı tarih"': "",
        '"İndirimli fiyatın bittiği tarih"': "",
        '"Vergi durumu"': "",
        '"Vergi sınıfı"': "",
        "Stokta?": inStock,
        "Stok": p.stock_quantity != null ? String(p.stock_quantity) : "",
        '"Düşük stok miktarı"': "",
        '"Yok satmaya izin?"': "0",
        '"Ayrı ayrı mı satılıyor?"': "0",
        '"Ağırlık (kg)"': "",
        '"Uzunluk (cm)"': "",
        '"Genişlik (cm)"': "",
        '"Yükseklik (cm)"': "",
        '"Müşteri değerlendirmelerine izin verilsin mi?"': "1",
        '"Satın alma notu"': "",
        '"İndirimli satış fiyatı"': p.sale_price || "",
        '"Normal fiyat"': p.regular_price || "",
        "Kategoriler": catChain,
        "Etiketler": tags,
        '"Gönderim sınıfı"': "",
        "Görseller": images,
        '"İndirme sınırı"': "",
        '"İndirme sona erme günü"': "",
        "Ebeveyn": "",
        '"Gruplanmış ürünler"': "",
        '"Yukarı satışlar"': "",
        '"Çapraz satışlar"': "",
        '"Harici URL"': "",
        '"Düğme metni"': "",
        "Konum": "",
      };

      const row = headerCols.map((h) => csvEscape(colMap[h] ?? ""));
      rows.push(row.join(","));
    }

    const outDir = path.join(cwd, "public", "uploads", "new-system");
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const ts = Date.now();
    const outName = `export-csv-${ts}.csv`;
    const outAbs = path.join(outDir, outName);
    fs.writeFileSync(outAbs, rows.join("\n"), "utf8");

    const publicUrl = `/uploads/new-system/${outName}`;
    return NextResponse.json({ url: publicUrl, count: products.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}