/** A Page or Source body with the etag its next write must present. */
export type Entry = { body: string; etag: string };

/** A stored key with its current etag, as the next write must present it. */
export type KeyEtag = { key: string; etag: string };

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
  /**
   * Every key starting with `prefix` with the etag `get` would return,
   * sorted by key, without reading the bodies where the storage allows.
   */
  manifest(prefix: string): Promise<KeyEtag[]>;
  /** Delete these keys. Only the seed script calls it, to reset a namespace. */
  remove(keys: string[]): Promise<void>;
}

export function byKey(a: KeyEtag, b: KeyEtag): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
