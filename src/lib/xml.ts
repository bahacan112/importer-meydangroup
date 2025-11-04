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
      const sku = p.sku || p.SKU || p.productCode || p.code || p["@sku"];
      const name = p.name || p.Name || p.title || p.Title || p["@name"];
      const description = p.description || p.Description || p.longDescription;
      const short_description = p.short_description || p.ShortDescription || p.shortDesc;
      const regular_price = String(p.regular_price || p.price || p.RegularPrice || p.Price || "");
      const sale_price = p.sale_price ? String(p.sale_price) : undefined;
      const stock_quantity = p.stock_quantity ?? p.stock ?? p.StockQuantity;
      const manage_stock = p.manage_stock ?? (stock_quantity != null);
      const status = p.status || (p.active ? "publish" : "draft");
      const images = (p.images || p.Images || [])
        .map((i: any) => (typeof i === "string" ? { src: i } : { src: i.src || i.url }))
        .filter((i: any) => i.src);
      const categories = (p.categories || p.Categories || [])
        .map((c: any) => (typeof c === "string" ? { name: c } : { name: c.name || c.Name }))
        .filter((c: any) => c.name);

      return ProductSchema.parse({
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
      });
    })
    .filter(Boolean);
  return mapped;
}