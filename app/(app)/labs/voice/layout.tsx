import { requireFeaturePage } from "@/lib/api/feature-page";

export default async function VoiceLabLayout({ children }: { children: React.ReactNode }) {
  await requireFeaturePage("voice_lab");
  return children;
}
