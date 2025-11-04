import { cookies } from "next/headers";

type WooConfig = {
  baseUrl: string;
  key: string;
  secret: string;
};

function getConfig(): WooConfig {
  const baseUrl = process.env.WOOCOMMERCE_URL || "";
  const key = process.env.WOOCOMMERCE_KEY || "";
  const secret = process.env.WOOCOMMERCE_SECRET || "";
  if (!baseUrl || !key || !secret) {
    throw new Error("WooCommerce ortam değişkenleri eksik (WOOCOMMERCE_URL/KEY/SECRET)");
  }
  return { baseUrl, key, secret };
}

function buildUrl(path: string, query: Record<string, string | number | boolean | undefined> = {}) {
  const { baseUrl, key, secret } = getConfig();
  const url = new URL(path, baseUrl);
  url.searchParams.set("consumer_key", key);
  url.searchParams.set("consumer_secret", secret);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined) url.searchParams.set(k, String(v));
  });
  return url.toString();
}

async function wooFetch<T = any>(path: string, init?: RequestInit, query?: Record<string, any>): Promise<T> {
  const url = buildUrl(path, query);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WooCommerce API hatası: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

export type WooProduct = {
  id?: number;
  name: string;
  type?: string;
  regular_price?: string;
  sale_price?: string;
  description?: string;
  short_description?: string;
  sku?: string;
  stock_quantity?: number;
  manage_stock?: boolean;
  status?: "draft" | "publish";
  images?: { src: string; name?: string; alt?: string }[];
  categories?: { id?: number; name?: string }[];
  tags?: { id?: number; name?: string }[];
};

export type WooCategory = {
  id?: number;
  name?: string;
  parent?: number;
  slug?: string;
  description?: string;
};

export type WooTag = {
  id?: number;
  name?: string;
  slug?: string;
  description?: string;
};

export async function getProductBySku(sku: string) {
  // Durum filtrelemesini geniş tutalım (taslak/publish fark etmeksizin bulabilelim)
  const data = await wooFetch<WooProduct[]>("/wp-json/wc/v3/products", { method: "GET" }, { sku, per_page: 1, status: "any" });
  return data[0];
}

export async function listAllProducts(): Promise<WooProduct[]> {
  // Sayfalama ile tüm ürünleri çek — son sayfaya kadar devam et
  let page = 1;
  const per_page = 100;
  const result: WooProduct[] = [];
  while (true) {
    const batch = await wooFetch<WooProduct[]>("/wp-json/wc/v3/products", { method: "GET" }, { per_page, page, status: "any" });
    result.push(...batch);
    if (batch.length < per_page) break;
    page++;
  }
  return result;
}

export async function createProduct(product: WooProduct) {
  return wooFetch<WooProduct>("/wp-json/wc/v3/products", { method: "POST", body: JSON.stringify(product) });
}

export async function updateProduct(id: number, product: Partial<WooProduct>) {
  return wooFetch<WooProduct>(`/wp-json/wc/v3/products/${id}`, { method: "PUT", body: JSON.stringify(product) });
}

export async function deleteProduct(id: number) {
  // Force = true ile kalıcı sil; isterseniz force=false ile çöpe taşıma
  return wooFetch<{ deleted: boolean }>(`/wp-json/wc/v3/products/${id}`, { method: "DELETE" }, { force: true });
}

export async function listAllCategories(): Promise<WooCategory[]> {
  let page = 1;
  const per_page = 100;
  const result: WooCategory[] = [];
  while (true) {
    const batch = await wooFetch<WooCategory[]>(
      "/wp-json/wc/v3/products/categories",
      { method: "GET" },
      { per_page, page }
    );
    result.push(...batch);
    if (batch.length < per_page) break;
    page++;
  }
  return result;
}

export async function deleteCategory(id: number) {
  return wooFetch<{ deleted: boolean }>(
    `/wp-json/wc/v3/products/categories/${id}`,
    { method: "DELETE" },
    { force: true }
  );
}

export async function createCategory(category: WooCategory) {
  // Create a category (requires manage terms capability).
  // Payload typically: { name: string, parent?: number }
  return wooFetch<WooCategory>(
    "/wp-json/wc/v3/products/categories",
    { method: "POST", body: JSON.stringify(category) }
  );
}

export async function listAllTags(): Promise<WooTag[]> {
  let page = 1;
  const per_page = 100;
  const result: WooTag[] = [];
  while (true) {
    const batch = await wooFetch<WooTag[]>(
      "/wp-json/wc/v3/products/tags",
      { method: "GET" },
      { per_page, page }
    );
    result.push(...batch);
    if (batch.length < per_page) break;
    page++;
  }
  return result;
}

export async function createTag(tag: WooTag) {
  return wooFetch<WooTag>(
    "/wp-json/wc/v3/products/tags",
    { method: "POST", body: JSON.stringify(tag) }
  );
}