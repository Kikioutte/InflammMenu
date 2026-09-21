import { useState, useEffect } from "react";
import { watchForAppUpdate, registerOfflineSupport } from "../storage";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Offline banner and install invitation. The service worker already precaches
 * the app; this only surfaces what the browser exposes, never fakes it.
 */
export function useInstallAndConnectivity() {
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    // Attach takeover listeners before registration can start an update.
    const stopWatching = watchForAppUpdate(() => setUpdateReady(true));
    void registerOfflineSupport();
    return stopWatching;
  }, []);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const markInstalled = () => { setInstalled(true); setInstallPrompt(null); };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      // The browser can withdraw the prompt between display and activation.
    } finally {
      setInstallPrompt(null);
    }
  };

  return {
    offline,
    canInstall: Boolean(installPrompt) && !installed,
    install,
    updateReady,
    reload: () => window.location.reload(),
  };
}
