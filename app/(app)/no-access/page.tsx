import Link from "next/link";
import { Lock } from "lucide-react";
import { Body, Crumb, TopBar, Wrap } from "@/components/ui/Layout";
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from "@/lib/constants/features";

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const requested = (await searchParams).feature;
  const feature = FEATURE_KEYS.find((key) => key === requested) as FeatureKey | undefined;

  return (
    <>
      <TopBar>
        <Crumb>
          <span className="text-fg">No access</span>
        </Crumb>
      </TopBar>
      <Body>
        <Wrap>
          <div className="flex flex-col items-center rounded-[10px] border border-line bg-panel-2 px-6 py-14 text-center">
            <Lock size={24} className="mb-3 text-fg-3" />
            <h1 className="mb-1.5 text-[18px] font-semibold">
              {feature ? `${FEATURE_LABELS[feature]} is not enabled` : "This feature is not enabled"}
            </h1>
            <p className="mb-5 max-w-[420px] text-[13px] text-fg-3">
              Your account does not have access yet. An administrator can turn it on for you.
            </p>
            <Link href="/account" className="text-[13px] text-accent no-underline hover:underline">
              Go to your account
            </Link>
          </div>
        </Wrap>
      </Body>
    </>
  );
}
