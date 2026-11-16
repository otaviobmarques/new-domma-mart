"use client";

import { type CheckoutConfig, resolveCheckoutConfig } from "@domma/core";
import { useEffect, useState } from "react";
import { type CheckoutData, CheckoutForm } from "./checkout-form";
import { CheckoutHeader } from "./checkout-header";

/** Checkout de verdade rodando em modo de pré-visualização: recebe do editor cada mudança e mostra na hora. */
export function PreviewHost({ data, initial }: { data: CheckoutData; initial: CheckoutConfig }) {
  const [config, setConfig] = useState(initial);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "dm-checkout-config") return;
      setConfig(resolveCheckoutConfig(event.data.config));
    };
    window.addEventListener("message", onMessage);
    window.parent?.postMessage({ type: "dm-checkout-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const live = { ...data, offer: { ...data.offer, config } };
  return (
    <div className="min-h-dvh" data-accent={config.accent}>
      <CheckoutHeader sellerName={data.seller.name} logoUrl={config.logo_url} />
      <CheckoutForm data={live} slug={data.offer.slug} utm={{}} apiUrl="" preview />
    </div>
  );
}
