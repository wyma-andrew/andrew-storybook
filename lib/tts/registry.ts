import { azureProvider } from "./providers/azure";
import { voxcpmProvider } from "./providers/voxcpm";
import type { ProviderId, TtsProvider } from "./types";

const PROVIDERS: Record<ProviderId, TtsProvider> = {
  azure: azureProvider,
  voxcpm: voxcpmProvider,
};

export function getTtsProvider(id: ProviderId) {
  return PROVIDERS[id];
}
