import { TranslateEditor } from "@/components/translate/TranslateEditor";

export default async function TranslateProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TranslateEditor projectId={id} />;
}
