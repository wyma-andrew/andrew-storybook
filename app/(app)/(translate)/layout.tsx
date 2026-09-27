import { requireFeaturePage } from "@/lib/api/feature-page";

export default async function TranslateLayout({ children }: { children: React.ReactNode }) {
  await requireFeaturePage("translate");
  return children;
}
