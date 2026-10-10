import { RecapV2Editor } from "@/components/recap-v2/RecapV2Editor";

export default async function RecapV2ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecapV2Editor projectId={id} />;
}
