import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import fs from "node:fs";

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
        p.sku || p.SKU || p.Sku || p.productCode || p.ProductCode || p.code || p.Code ||
        p.id || p.ID || p["@sku"] || p["@SKU"] || p["@code"] || p["@id"];
      const name =
        p.name || p.Name || p.title || p.Title || p.productName || p.ProductName ||
        p["@name"] || p["@Name"];
      const description = p.description || p.Description || p.longDescription || p.desc || p.Desc;
      const short_description =
        p.short_description || p.ShortDescription || p.shortDesc || p.ShortDesc || p.summary || p.Summary;
      const regular_price = String(p.regular_price || p.price || p.RegularPrice || p.Price || "");
      const sale_price = p.sale_price ? String(p.sale_price) : undefined;
      const stock_quantity = p.stock_quantity ?? p.stock ?? p.StockQuantity;
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
        sku,
        name,
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