import { en } from './en';

export type { Strings } from './en';

// Localization seam: every screen reads its strings through this hook rather
// than importing `en` directly, so a future locale switch only has to change
// what this function returns. For now it always returns the English strings.
export function useStrings() {
  return en;
}
