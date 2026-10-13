import { ProviderContext, SettingsField } from "../types";

export async function getSettingsSchema({ providerContext: _ctx }: {
  providerContext: ProviderContext;
}): Promise<SettingsField[]> {
  return [
    { key: "mediaflowUrl", type: "text", label: "MediaFlow Proxy URL", description: "Your self-hosted HTTPS MediaFlow endpoint. Required for V1 MPD-to-HLS conversion; leave empty for direct MPD.", placeholder: "https://proxy.example.com", defaultValue: "" },
    { key: "mediaflowPassword", type: "text", label: "MediaFlow API password", description: "Set this only for your own trusted proxy. Never share proxy URLs containing secrets.", defaultValue: "" },
  ];
}
