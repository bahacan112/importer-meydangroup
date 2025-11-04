import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "WC Importer",
  description: "WooCommerce ürün senkronizasyon mini uygulaması",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
