import { VoiceLabEditor } from "@/components/voice-lab/VoiceLabEditor";

export default async function VoiceLabProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VoiceLabEditor projectId={id} />;
}
