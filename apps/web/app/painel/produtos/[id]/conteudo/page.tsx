import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentEditor, type EditorModule } from "@/components/painel/content-editor";
import { ApiError, api } from "@/lib/api";

export const metadata: Metadata = { title: "Conteúdo do curso" };

export default async function ContentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let product: { id: string; name: string; modules: EditorModule[] };
  try {
    product = await api(`/v1/products/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  return <ContentEditor productId={product.id} productName={product.name} initial={product.modules} />;
}
