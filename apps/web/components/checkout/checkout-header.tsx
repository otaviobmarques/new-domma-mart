import { Lock } from "lucide-react";
import type { ReactNode } from "react";

/** Topo do checkout: marca do produtor e o selo de pagamento seguro (que não pode ser removido). */
export function CheckoutHeader({ sellerName, logoUrl, right }: { sellerName: string; logoUrl: string | null; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-graphite/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={sellerName} className="h-8 max-w-[45%] object-contain object-left" referrerPolicy="no-referrer" />
        ) : (
          <span className="max-w-[60%] truncate rounded-md border border-dashed border-line px-2.5 py-1 text-sm font-bold">{sellerName}</span>
        )}
        <span className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ok">
            <Lock size={15} aria-hidden /> Pagamento seguro
          </span>
          {right}
        </span>
      </div>
    </header>
  );
}
