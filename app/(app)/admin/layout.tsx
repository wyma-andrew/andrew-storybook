import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/api/auth-guard";
import { getSessionUser } from "@/lib/supabase/route";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (!(await isAdminUser(user.id, user.email))) redirect("/no-access");
  return children;
}
