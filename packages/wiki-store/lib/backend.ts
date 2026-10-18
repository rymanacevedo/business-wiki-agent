/** A Page or Source body with the etag its next write must present. */
export type Entry = { body: string; etag: string };

/**
 * Raw key-value storage behind the WikiStore. Keys arrive already namespaced;
 * a backend knows nothing about namespaces, Pages, or Sources.
 */
export interface Backend {
  get(key: string): Promise<Entry | null>;
  /** `ifMatch: null` means the key must not exist yet. */
  put(
    key: string,
    body: string,
    ifMatch: string | null
  ): Promise<{ etag: string }>;
  /** Every key starting with `prefix`, sorted. */
  list(prefix: string): Promise<string[]>;
}
