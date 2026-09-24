import { ProviderContext, SettingsField } from "../types";

export const getSettingsSchema = async function ({
  providerContext,
}: {
  providerContext: ProviderContext;
}): Promise<SettingsField[]> {
  return [
    {
      key: "baseUrlOverride",
      type: "select",
      label: "Active Mirror Domain",
      description: "Select mirror if your ISP blocks the main website",
      options: [
        { label: "multimovies.shop", value: "https://multimovies.shop" },
        { label: "multimovies.click", value: "https://multimovies.click" },
        { label: "multimovies.ch", value: "https://multimovies.ch" },
        { label: "multimovies.tax", value: "https://multimovies.tax" },
        { label: "multimovies.top", value: "https://multimovies.top" },
      ],
      defaultValue: "https://multimovies.shop",
    },
  ];
};
