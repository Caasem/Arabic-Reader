import type { Manifest, PackFile } from './manifest';

/**
 * Pack bookkeeping on the device (docs/specs/data-architecture.md 5.3). All of it is local only: each device
 * downloads its own packs, so none of these tables is synced, and none is in a backup.
 */

/** A pack that is installed and complete. One row per pack; this row is what says which version is in use. */
export interface InstalledPackRow {
  id: string;
  version: number;
  title: string;
  /** The files of the installed version; their bytes are in the BlobStore under owner `<id>@<version>`. */
  files: PackFile[];
  size: number;
  installedAt: number;
}

/** `packMeta` rows. Today only the last manifest that passed every check. */
export interface PackMetaRow {
  id: 'manifest';
  manifest: Manifest;
  fetchedAt: number;
}

/** One downloaded range of a file that is still being fetched, so an interrupted download resumes. */
export interface PackPartRow {
  /** `<file hash>:<index>`. */
  key: string;
  hash: string;
  index: number;
  data: Blob;
}

export type PackStatus = 'absent' | 'downloading' | 'ready' | 'update-available' | 'failed' | 'disabled';

export interface PackInfo {
  id: string;
  title: string;
  description?: string;
  kind: Manifest['packs'][number]['kind'];
  /** Version the manifest offers. */
  version: number;
  /** Bytes to download for it. */
  size: number;
  licence: Manifest['packs'][number]['licence'];
  status: PackStatus;
  installedVersion?: number;
  /** Plain-language reason when `status` is 'failed' or the pack cannot be installed. */
  reason?: string;
  /** 0..1 while downloading. */
  progress?: number;
}

export type PackErrorCode = 'offline' | 'verification' | 'quota' | 'needs-newer-app' | 'not-offered' | 'disabled' | 'aborted' | 'not-configured';

export class PackError extends Error {
  readonly code: PackErrorCode;
  constructor(code: PackErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PackError';
    this.code = code;
  }
}
