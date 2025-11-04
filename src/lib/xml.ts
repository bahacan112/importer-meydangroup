import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import fs from "node:fs";

function pickField(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj[k] != null) return obj[k];
    const lower = k.toLowerCase();
    const upper = k.toUpperCase();
    if (obj[lower] != null) return obj[lower];
    if (obj[upper] != null) return obj[upper];
    if (obj[`@${k}`] != null) return obj[`@${k}`];
    if (obj[`@${upper}`] != null) return obj[`@${upper}`];
    if (obj[`@${lower}`] != null) return obj[`@${lower}`];
    // Bazı XML'lerde attributes ayrı bir düğümde olabilir
    if (obj.attributes && obj.attributes[k] != null) return obj.attributes[k];
    if (obj.Attributes && obj.Attributes[k] != null) return obj.Attributes[k];
  }
  return undefined;
}

function pickByFragments(obj: any, fragments: string[]): any {
  const keys = Object.keys(obj || {});
  for (const key of keys) {
    const keyLc = key.toLowerCase();
    if (fragments.some((f) => keyLc.includes(f.toLowerCase()))) {
      return obj[key];
    }
  }
  // Attributes içinde arama
  if (obj && (obj.attributes || obj.Attributes)) {
    const attrs = obj.attributes || obj.Attributes;
    const aKeys = Object.keys(attrs || {});
    for (const key of aKeys) {
      const keyLc = key.toLowerCase();
      if (fragments.some((f) => keyLc.includes(f.toLowerCase()))) {
        return attrs[key];
      }
    }
  }
  return undefined;
}

export const ProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  short_description: z.string().optional(),
  regular_price: z.string().optional(),
  sale_price: z.string().optional(),
  stock_quantity: z.coerce.number().optional(),
  manage_stock: z.coerce.boolean().optional(),
  status: z.enum(["draft", "publish"]).optional(),
  images: z.array(z.object({ src: z.string().url() })).optional(),
  categories: z.array(z.object({ name: z.string() })).optional(),
});

export type ParsedProduct = z.infer<typeof ProductSchema>;

export function parseXmlProducts(xmlPath: string): ParsedProduct[] {
  if (!fs.existsSync(xmlPath)) {
    throw new Error(`XML path bulunamadı: ${xmlPath}`);
  }
  const xmlStr = fs.readFileSync(xmlPath, "utf8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    textNodeName: "#text",
  });
  const json = parser.parse(xmlStr);
  // Beklenen yapı örneği: <products><product>...</product></products>
  const rawProducts =
    json.products?.product ?? json.Products?.Product ?? json.items?.item ?? [];
  const arr = Array.isArray(rawProducts) ? rawProducts : [rawProducts];
  const mapped: ParsedProduct[] = arr
    .map((p: any) => {
      // Sık kullanılan alan adlarını normalize et
      const sku =
        pickField(p, [
          "sku",
          "SKU",
          "productCode",
          "ProductCode",
          "code",
          "Code",
          "id",
          "ID",
        ]) ?? pickByFragments(p, ["sku", "code", "id", "stock", "stok"]);
      const name =
        pickField(p, [
          "name",
          "Name",
          "title",
          "Title",
          "productName",
          "ProductName",
        ]) ?? pickByFragments(p, ["name", "title", "product", "item", "urun", "adı", "adi"]);
      const description = p.description || p.Description || p.longDescription || p.desc || p.Desc;
      const short_description =
        p.short_description || p.ShortDescription || p.shortDesc || p.ShortDesc || p.summary || p.Summary;
      // Fiyat alanları farklı isimlerle gelebilir: fiyat/fiyatk/price
      const normalizePriceString = (val: any): string | undefined => {
        if (val === null || val === undefined) return undefined;
        let s = String(val).trim();
        // Türkçe format: 50,65 -> 50.65
        s = s.replace(/\./g, ""); // binlik ayraç . ise kaldır
        s = s.replace(/,/g, ".");
        // sadece sayı ve nokta kalsın
        s = s.replace(/[^0-9.]/g, "");
        return s || undefined;
      };
      const priceRaw = pickField(p, ["regular_price", "price", "Price", "fiyat", "Fiyat", "fiyatk", "Fiyatk", "FiyatK"]); 
      const saleRaw = pickField(p, ["sale_price", "salePrice", "fiyatk", "Fiyatk", "FiyatK"]);
      const regular_price = normalizePriceString(priceRaw);
      const sale_price = normalizePriceString(saleRaw);

      // Stok alanları: stock_quantity/stock/quantity/adet/miktar
      const stockRaw = pickField(p, ["stock_quantity", "stock", "StockQuantity", "quantity", "Quantity", "adet", "Adet", "miktar", "Miktar"]);
      const stock_quantity = stockRaw != null ? Number(String(stockRaw).replace(/[^0-9-]/g, "")) : undefined;
      const manage_stock = p.manage_stock ?? p.manageStock ?? (stock_quantity != null);
      const status = p.status || (p.active ? "publish" : "draft");
      // images ve categories bazen tek obje olarak gelebilir; güvenli şekilde diziye çevir
      const imagesRaw = p.images ?? p.Images ?? [];
      const imagesArr = Array.isArray(imagesRaw) ? imagesRaw : imagesRaw ? [imagesRaw] : [];
      const images = imagesArr
        .map((i: any) => (typeof i === "string" ? { src: i } : { src: i?.src || i?.url }))
        .filter((i: any) => i && i.src);
      const categoriesRaw = p.categories ?? p.Categories ?? [];
      const categoriesArr = Array.isArray(categoriesRaw) ? categoriesRaw : categoriesRaw ? [categoriesRaw] : [];
      const categories = categoriesArr
        .map((c: any) => (typeof c === "string" ? { name: c } : { name: c?.name || c?.Name }))
        .filter((c: any) => c && c.name);

      const candidate = {
        sku: sku != null ? String(sku) : undefined,
        name: name != null ? String(name) : undefined,
        description,
        short_description,
        regular_price,
        sale_price,
        stock_quantity,
        manage_stock,
        status,
        images,
        categories,
      };
      const parsed = ProductSchema.safeParse(candidate);
      if (!parsed.success) {
        // Hatalı ürünü atla; logla ki teşhis edilebilsin
        console.warn("XML ürün şeması hatası:", parsed.error.issues);
        return null;
      }
      return parsed.data;
    })
    .filter((p): p is ParsedProduct => !!p);
  return mapped;
}