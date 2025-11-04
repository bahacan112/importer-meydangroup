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
  images?: { src: string }[];
  categories?: { id?: number; name?: string }[];
};

export async function getProductBySku(sku: string) {
  const data = await wooFetch<WooProduct[]>("/wp-json/wc/v3/products", { method: "GET" }, { sku, per_page: 1 });
  return data[0];
}

export async function listAllProducts(): Promise<WooProduct[]> {
  // Sayfalama ile tüm ürünleri çek
  let page = 1;
  const per_page = 100;
  const result: WooProduct[] = [];
  // 50 sayfaya kadar güvenli sınır
  while (page <= 50) {
    const batch = await wooFetch<WooProduct[]>("/wp-json/wc/v3/products", { method: "GET" }, { per_page, page });
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