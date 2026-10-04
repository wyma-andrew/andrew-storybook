import { Body, TopBar, Wrap } from "@/components/ui/Layout";
import { VideoCutter } from "@/components/video-cutter/VideoCutter";

export default function VideoCutterPage() {
  return (
    <>
      <TopBar>
        <div className="text-[19px] font-medium">Video Cutter</div>
      </TopBar>
      <Body>
        <Wrap>
          <p className="mb-5 text-sm text-fg-2">
            Trim one part of a video on this device without losing quality. Nothing is uploaded or stored.
          </p>
          <VideoCutter />
        </Wrap>
      </Body>
    </>
  );
}
