import { requireFeaturePage } from "@/lib/api/feature-page";

export default async function StoryLayout({ children }: { children: React.ReactNode }) {
  await requireFeaturePage("stories");
  return children;
}
