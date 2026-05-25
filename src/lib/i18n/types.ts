export type Locale = "en" | "vi";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "nano-agent-locale";

export type MessageTree = {
  [key: string]: string | MessageTree;
};
