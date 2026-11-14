import { SplitterEditor } from "@/components/splitter/SplitterEditor";

export default async function SplitterProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SplitterEditor projectId={id} />;
}
