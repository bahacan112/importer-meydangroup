"use client";
import { useFormState, useFormStatus } from "react-dom";
import { increasePricesFormAction } from "../actions/ops";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Uygulanıyor..." : "Artırmayı Uygula"}
    </Button>
  );
}

export function OpsForm() {
  const [state, formAction] = useFormState(increasePricesFormAction as any, { ok: false });
  return (
    <form action={formAction} className="space-y-3">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm">Kategori ID’leri (virgülle)</label>
          <input name="categoryIds" placeholder="12,34,56" className="mt-1 w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="text-sm">Etiket ID’leri (virgülle)</label>
          <input name="tagIds" placeholder="5,8,13" className="mt-1 w-full border rounded px-2 py-1" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm">Kategori adı içerir</label>
          <input name="categoryNameIncludes" placeholder="ör. ayakkabı" className="mt-1 w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="text-sm">Etiket adı içerir</label>
          <input name="tagNameIncludes" placeholder="ör. yaz" className="mt-1 w-full border rounded px-2 py-1" />
        </div>
      </div>
      <SubmitButton />
      {state && (state as any).ok && (
        <p className="text-sm text-green-700">
          Güncellendi: {(state as any).updated} / {(state as any).total} ürün. Uygulanan oran: {(state as any).percent}% ({(state as any).applyOn}).
        </p>
      )}
      {state && !(state as any).ok && (state as any).error && (
        <p className="text-sm text-red-700">Hata: {(state as any).error}</p>
      )}
    </form>
  );
}