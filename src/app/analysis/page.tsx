import { getLastReport, listReports, getReportByFile } from "../actions/sync";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Shell } from "@/components/shell";

type Report = {
  created: number;
  updated: number;
  deleted: number;
  total: number;
  createdSkus: string[];
  updatedSkus: string[];
  deletedSkus: string[];
  errors: { sku?: string; message: string }[];
};

export default async function AnalysisPage({ searchParams }: { searchParams?: Promise<{ file?: string }> }) {
  const files = await listReports();
  const sp = (await searchParams) || {};
  const selected = sp.file || files[0] || "sync-report-latest.json";
  const report = selected ? await getReportByFile(selected) : await getLastReport();
  return (
    <Shell>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">İçe Aktarım Analizi</h1>
        <div className="flex items-center gap-2">
          <Link href="/dashboard"><Button variant="secondary">Dashboard’a Dön</Button></Link>
          <div className="flex items-center gap-2">
            <label className="text-sm">Rapor Seç</label>
            <form action="/analysis" method="GET" className="flex items-center gap-2">
              <select name="file" className="border rounded h-9 px-2" defaultValue={selected}>
                {files.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <Button type="submit" variant="outline">Göster</Button>
            </form>
          </div>
        </div>
      </div>
      <Card className="p-4">
        {report ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded border"><div className="text-sm text-muted-foreground">Toplam XML</div><div className="text-lg font-medium">{report.total}</div></div>
              <div className="p-3 rounded border"><div className="text-sm text-muted-foreground">Eklendi</div><div className="text-lg font-medium text-green-600">{report.created}</div></div>
              <div className="p-3 rounded border"><div className="text-sm text-muted-foreground">Güncellendi</div><div className="text-lg font-medium text-blue-600">{report.updated}</div></div>
              <div className="p-3 rounded border"><div className="text-sm text-muted-foreground">Silindi</div><div className="text-lg font-medium text-red-600">{report.deleted}</div></div>
            </div>

            {report.createdSkus.length > 0 && (
              <div>
                <h2 className="font-medium mb-2">Eklenen Ürünler</h2>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.createdSkus.map((sku) => (
                        <TableRow key={`c-${sku}`}>
                          <TableCell className="font-mono">{sku}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {report.updatedSkus.length > 0 && (
              <div>
                <h2 className="font-medium mb-2">Güncellenen Ürünler</h2>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.updatedSkus.map((sku) => (
                        <TableRow key={`u-${sku}`}>
                          <TableCell className="font-mono">{sku}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {report.deletedSkus.length > 0 && (
              <div>
                <h2 className="font-medium mb-2">Silinen Ürünler</h2>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.deletedSkus.map((sku) => (
                        <TableRow key={`d-${sku}`}>
                          <TableCell className="font-mono">{sku}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {report.errors.length > 0 && (
              <div>
                <h2 className="font-medium mb-2">Hatalar</h2>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Mesaj</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.errors.map((e, idx) => (
                        <TableRow key={`e-${idx}`}>
                          <TableCell className="font-mono">{e.sku ?? "-"}</TableCell>
                          <TableCell>{e.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>Henüz bir rapor bulunamadı.</div>
        )}
      </Card>
    </div>
    </Shell>
  );
}