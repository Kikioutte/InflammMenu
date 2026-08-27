export const SHARED_GITHUB_PAGES_HOST = "kikioutte.github.io";

export function isSharedStorageOrigin(hostname: string): boolean {
  return hostname.toLocaleLowerCase("en-US") === SHARED_GITHUB_PAGES_HOST;
}

export function usesSharedGitHubPagesOrigin(): boolean {
  return typeof window !== "undefined" && isSharedStorageOrigin(window.location.hostname);
}
