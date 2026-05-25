import { getMessages, type Messages } from "./messages";
import type { Locale } from "./types";

export type TranslateParams = Record<string, string | number>;

function getNested(obj: Messages, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function translate(
  locale: Locale,
  key: string,
  params?: TranslateParams,
): string {
  const template = getNested(getMessages(locale), key) ?? getNested(getMessages("en"), key) ?? key;
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{{${name}}}`,
  );
}
