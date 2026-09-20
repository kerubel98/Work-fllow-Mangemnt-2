/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, ComponentType } from 'react';

/**
 * Resilient lazy loader for code-split modules.
 * Automatically retries failed dynamic imports (e.g. on server reboot or temporary network drop)
 * and safely reloads once if chunk hashes have updated after a new build.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  moduleName?: string
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    const storageKey = `chunk_retry_${moduleName || 'general'}`;
    const alreadyReloaded = window.sessionStorage.getItem(storageKey) === 'true';

    try {
      const component = await factory();
      window.sessionStorage.removeItem(storageKey);
      return component;
    } catch (firstError: any) {
      console.warn(`[lazyWithRetry] First attempt failed for ${moduleName || 'module'}:`, firstError);

      // Attempt 2: brief delay and retry (handles server restart/reconnect)
      try {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const component = await factory();
        window.sessionStorage.removeItem(storageKey);
        return component;
      } catch (secondError: any) {
        console.warn(`[lazyWithRetry] Second attempt failed for ${moduleName || 'module'}:`, secondError);

        // Attempt 3: If chunk hash changed or stale cache, hard reload once
        if (!alreadyReloaded) {
          window.sessionStorage.setItem(storageKey, 'true');
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }

        throw secondError;
      }
    }
  });
}
