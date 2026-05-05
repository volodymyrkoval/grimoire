import { App, Platform, FileSystemAdapter } from 'obsidian';

export function computeVaultMountDefault(app: App): string {
  if (!Platform.isDesktop) return '';
  try {
    return (app.vault.adapter as FileSystemAdapter).getBasePath();
  } catch (e) {
    console.error(e);
    return '';
  }
}
