import { requireFeaturePage } from "@/lib/api/feature-page";

export default async function SplitterLayout({ children }: { children: React.ReactNode }) {
  await requireFeaturePage("movie_recap");
  return children;
}
