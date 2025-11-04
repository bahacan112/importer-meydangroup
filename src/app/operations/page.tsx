import { Shell } from "@/components/shell";
import { increasePricesForm } from "../actions/ops";
import { Button } from "@/components/ui/button";

export default function OperationsPage() {
  return (
    <Shell>
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Toplu İşlemler</h1>
        <section className="space-y-3">
          <h2 className="font-medium">Fiyatları Toplu Artır</h2>
          <form action={increasePricesForm} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-sm">Artış Oranı (%)</label>
                <input name="percent" type="number" step="0.01" defaultValue={20} className="mt-1 w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label className="text-sm">Uygulanacak Alan</label>
                <select name="applyOn" defaultValue="regular" className="mt-1 w-full border rounded px-2 py-1">
                  <option value="regular">Regular</option>
                  <option value="sale">Sale</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <label className="text-sm">Yuvarlama</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="checkbox" name="roundToInteger" defaultChecked />
                    <span className="text-sm">Tam TL’ye yuvarla</span>
                  </div>
                </div>
              </div>
            </div>
            <Button type="submit">Artırmayı Uygula</Button>
          </form>
        </section>
      </div>
    </Shell>
  );
}