import Link from "next/link";
import { Button } from "./ui/button";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r bg-muted/20">
        <div className="p-4">
          <div className="text-lg font-semibold">WC Importer</div>
          <div className="text-xs text-muted-foreground">Mini Dashboard</div>
        </div>
        <div className="border-b" />
        <nav className="p-2 space-y-1">
          <NavItem href="/dashboard" label="Dashboard" />
          <NavItem href="/analysis" label="Analiz" />
          <NavItem href="/settings" label="Ayarlar" />
          <NavItem href="/operations" label="Toplu İşlemler" />
        </nav>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b px-4 flex items-center justify-between bg-background">
          <div className="font-medium">Yönetim Paneli</div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard"><Button variant="outline" size="sm">Dashboard</Button></Link>
            <Link href="/analysis"><Button variant="outline" size="sm">Analiz</Button></Link>
            <Link href="/settings"><Button variant="outline" size="sm">Ayarlar</Button></Link>
            <Link href="/operations"><Button variant="default" size="sm">Toplu İşlemler</Button></Link>
          </div>
        </header>
        <main className="p-4">{children}</main>
      </div>
    </div>
  );
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block px-3 py-2 rounded hover:bg-muted">
      {label}
    </Link>
  );
}