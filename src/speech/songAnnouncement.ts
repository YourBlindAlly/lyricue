/**
 * Builds the spoken title/key/capo announcement that's now the first thing a
 * pedal press reveals for any song — Rusty relies on hearing the key every
 * time, even for songs he already knows by heart, and this needed to be
 * something the app's own voice always says reliably rather than left to
 * chance whether VoiceOver happens to read the on-screen header. Capo joins
 * the same announcement for the same reason — it's exactly the kind of
 * "must know before you start playing" fact that shouldn't depend on
 * someone reading the file's raw text first.
 */
export function buildSongAnnouncement(title: string, key?: string, capo?: string): string {
  const trimmedTitle = title.trim();
  const trimmedKey = key?.trim();
  const trimmedCapo = capo?.trim();
  const parts = [trimmedTitle];
  if (trimmedKey) {
    parts.push(`Key of ${trimmedKey}`);
  }
  if (trimmedCapo) {
    parts.push(`Capo ${trimmedCapo}`);
  }
  return parts.join(', ');
}
