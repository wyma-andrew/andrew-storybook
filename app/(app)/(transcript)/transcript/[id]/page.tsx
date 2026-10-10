import { TranscriptEditor } from "@/components/transcript/TranscriptEditor";

export default async function TranscriptProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TranscriptEditor projectId={id} />;
}
