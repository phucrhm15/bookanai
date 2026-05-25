import type { Locale } from "../types";
import { en } from "./en";
import { vi } from "./vi";

export const messages = { en, vi } as const;

export type Messages = typeof en;

export function getMessages(locale: Locale): Messages {
  return messages[locale] ?? messages.en;
}
