import { Clapperboard } from "lucide-react";
import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { EmptyCta } from "@/components/ui/EmptyCta";

export default function MovieRecapPage() {
  return (
    <>
      <TopBar>
        <div className="text-[19px] font-medium">Movie Recap</div>
      </TopBar>
      <Body>
        <Wrap>
          <EmptyCta title="Coming soon" icon={<Clapperboard size={20} />}>
            Movie Recap is not built yet.
          </EmptyCta>
        </Wrap>
      </Body>
    </>
  );
}
