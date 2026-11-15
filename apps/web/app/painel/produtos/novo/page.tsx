import type { Metadata } from "next";
import { NewProduct } from "@/components/painel/new-product";

export const metadata: Metadata = { title: "Novo produto" };

export default function NewProductPage() {
  return <NewProduct initialDescription="" />;
}
