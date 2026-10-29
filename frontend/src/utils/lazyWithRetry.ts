/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, ComponentType } from 'react';

/**
 * Enhanced lazy import with automatic retry and page reload for stale chunks.
 * Prevents "Failed to fetch dynamically imported module" errors after production builds.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T } | { [key: string]: any }>
) {
  return lazy(async () => {
    const pageHasBeenForceReloaded = window.sessionStorage.getItem(
      'chunk_reload_guard_' + window.location.pathname
    );

    try {
      const module = await factory();
      // Clear reload guard on successful load
      if (pageHasBeenForceReloaded) {
        window.sessionStorage.removeItem('chunk_reload_guard_' + window.location.pathname);
      }
      return 'default' in module ? (module as { default: T }) : { default: Object.values(module)[0] as T };
    } catch (error: any) {
      const isChunkError =
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.message?.includes('Importing a module script failed') ||
        error?.message?.includes('error loading dynamically imported module') ||
        error?.message?.includes('Loading chunk') ||
        error?.name === 'ChunkLoadError';

      if (isChunkError && !pageHasBeenForceReloaded) {
        console.warn('[lazyWithRetry] Stale chunk detected after build. Force-reloading to fetch latest assets...', error);
        window.sessionStorage.setItem('chunk_reload_guard_' + window.location.pathname, 'true');
        window.location.reload();
        // Return a pending promise so React doesn't crash before the reload kicks in
        return new Promise(() => {}) as any;
      }

      // If already reloaded once and still failed, bubble up to ErrorBoundary
      console.error('[lazyWithRetry] Dynamic import failed permanently:', error);
      throw error;
    }
  });
}
