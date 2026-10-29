export interface UnconfiguredFolderLike {
  folderPath: string;
  fileCount?: number;
  sampleFileNames?: string[];
}

export interface UnconfiguredFolderGroup<T extends UnconfiguredFolderLike = UnconfiguredFolderLike> {
  /** Parent directory shared by every folder in the group. */
  parent: string;
  /** Path pattern one root feed can cover, e.g. "/data/IPS/{month}". */
  pattern: string;
  /** True when the child folder names look like rotating periods (months / dates). */
  isRotating: boolean;
  folders: T[];
  totalFiles: number;
}

const MONTH_WORDS = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const YEAR = /(19|20)\d{2}/;
const NUMERIC_DATE = /^\d{2,4}[-_]\d{2}([-_]\d{2,4})?$|^\d{8}$/;

function normalise(path: string): string {
  const p = (path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

function splitPath(path: string): { parent: string; leaf: string } {
  const p = normalise(path);
  const i = p.lastIndexOf('/');
  if (i <= 0) return { parent: '/', leaf: p.replace(/^\//, '') };
  return { parent: p.slice(0, i), leaf: p.slice(i + 1) };
}

function periodKind(leaf: string): 'month' | 'date' | null {
  if (MONTH_WORDS.test(leaf) && (YEAR.test(leaf) || /[-_ ]\d{1,2}$/.test(leaf) || leaf.length <= 12)) return 'month';
  if (NUMERIC_DATE.test(leaf)) return 'date';
  return null;
}

/**
 * Groups discovered, uncovered folders that share a parent so one root feed can cover them all.
 * A parent only becomes a pattern group when it has two or more children; single folders stay literal.
 * Groups are ordered by number of folders (largest first), then path.
 */
export function groupUnconfiguredFolders<T extends UnconfiguredFolderLike>(folders: T[]): UnconfiguredFolderGroup<T>[] {
  const byParent = new Map<string, T[]>();
  for (const f of folders) {
    const { parent } = splitPath(f.folderPath);
    byParent.set(parent, [...(byParent.get(parent) || []), f]);
  }

  const groups: UnconfiguredFolderGroup<T>[] = [];
  for (const [parent, items] of byParent) {
    const sorted = [...items].sort((a, b) => a.folderPath.localeCompare(b.folderPath));
    const totalFiles = sorted.reduce((n, f) => n + (f.fileCount || 0), 0);
    if (sorted.length < 2) {
      groups.push({ parent, pattern: normalise(sorted[0].folderPath), isRotating: false, folders: sorted, totalFiles });
      continue;
    }
    const kinds = sorted.map(f => periodKind(splitPath(f.folderPath).leaf));
    const rotating = kinds.filter(Boolean).length >= Math.ceil(sorted.length * 0.6);
    const kind = kinds.find(Boolean);
    const token = rotating ? (kind === 'date' ? '{date}' : '{month}') : '*';
    groups.push({
      parent,
      pattern: `${parent === '/' ? '' : parent}/${token}`,
      isRotating: rotating,
      folders: sorted,
      totalFiles
    });
  }
  return groups.sort((a, b) => b.folders.length - a.folders.length || a.pattern.localeCompare(b.pattern));
}

export interface ConnectionErrorSummary {
  kind: 'TIMEOUT' | 'REFUSED' | 'AUTH' | 'NOT_FOUND' | 'UNKNOWN';
  title: string;
  detail: string;
}

/** Turns a raw connector error into a plain-language summary. Never echoes credentials. */
export function summariseConnectionError(rawMessage: string | undefined | null, serverName: string): ConnectionErrorSummary {
  const raw = String(rawMessage || '');
  const name = serverName || 'the server';
  if (/timed? ?out|etimedout|handshake|timeout/i.test(raw)) {
    return {
      kind: 'TIMEOUT',
      title: `Could not reach ${name}`,
      detail: 'The connection timed out while waiting for the handshake. Check that the server is running and reachable from this network.'
    };
  }
  if (/econnrefused|refused/i.test(raw)) {
    return {
      kind: 'REFUSED',
      title: `${name} refused the connection`,
      detail: 'Nothing is accepting connections on that host and port. Check the address, the port and that the service is running.'
    };
  }
  if (/auth|permission|denied|login|credential|530/i.test(raw)) {
    return {
      kind: 'AUTH',
      title: `${name} rejected the sign-in`,
      detail: 'The server was reached but the username or password was not accepted. Update the connection credentials in Connections.'
    };
  }
  if (/enotfound|getaddrinfo|not found|dns/i.test(raw)) {
    return {
      kind: 'NOT_FOUND',
      title: `Could not find ${name}`,
      detail: 'The host name could not be resolved. Check the host address in Connections.'
    };
  }
  return {
    kind: 'UNKNOWN',
    title: `Could not read files from ${name}`,
    detail: raw ? raw.slice(0, 200) : 'The server did not respond as expected. Try the connection test for more detail.'
  };
}
