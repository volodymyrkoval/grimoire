import { App, Platform, FileSystemAdapter } from 'obsidian';

/**
 * Resolves the default vault mount path from the Obsidian app on desktop systems.
 * Returns an empty string on non-desktop platforms or if the path cannot be determined.
 */
export function computeVaultMountDefault(app: App): string {
  if (!Platform.isDesktop) return '';
  try {
    return (app.vault.adapter as FileSystemAdapter).getBasePath();
  } catch (e) {
    console.error(e);
    return '';
  }
}
