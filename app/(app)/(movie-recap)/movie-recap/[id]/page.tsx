import { MovieRecapWizard } from "@/components/movie-recap/MovieRecapWizard";

export default async function MovieRecapProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MovieRecapWizard projectId={id} />;
}
