import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { MobileScroll } from "./mobile";

type ReloadControl = { beforeReload: () => Promise<boolean> };

/** Load secondary screens on entry, retaining live props and recoverable failures. */
export function deferredScreen<Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>,
  title: string,
): ComponentType<Props & ReloadControl> {
  let loaded: ComponentType<Props> | null = null;
  let pending: Promise<ComponentType<Props>> | null = null;
  const request = () => pending ??= load().then(({ default: View }) => {
    loaded = View;
    return View;
  }).catch((error: unknown) => {
    pending = null;
    throw error;
  });

  return function DeferredScreen(props: Props & ReloadControl) {
    const [View, setView] = useState(() => loaded);
    const [failed, setFailed] = useState(false);
    const [reloading, setReloading] = useState(false);
    const [reloadError, setReloadError] = useState("");
    const reloadPending = useRef(false);
    const host = useRef<HTMLDivElement>(null);
    const restoreFocus = useRef(false);

    useEffect(() => {
      if (View) return;
      let active = true;
      void request().then((Component) => {
        if (!active) return;
        restoreFocus.current ||= Boolean(host.current?.contains(document.activeElement));
        setView(() => Component);
      }, () => { if (active) setFailed(true); });
      return () => { active = false; };
    }, [View]);

    const reload = async () => {
      if (reloadPending.current) return;
      reloadPending.current = true;
      setReloading(true);
      setReloadError("");
      try {
        const savedCurrentState = await props.beforeReload();
        if (!host.current?.closest('[data-flow-current="true"]')) return;
        if (savedCurrentState) window.location.reload();
        else setReloadError("Des changements récents ont été détectés. Relancez le rechargement pour les conserver.");
      }
      catch { setReloadError("La sauvegarde n’a pas pu être vérifiée. L’application reste ouverte pour conserver vos changements. Vérifiez le stockage disponible et les réglages du navigateur, puis réessayez."); }
      finally { reloadPending.current = false; setReloading(false); }
    };

    useLayoutEffect(() => {
      // FlowStack may have focused the loading heading before this download
      // completed. Transfer that focus, but never take it from another screen
      // or from the persistent Back button.
      if (!View || !restoreFocus.current) return;
      restoreFocus.current = false;
      if (host.current?.closest("[inert]") || document.activeElement !== document.body) return;
      const heading = host.current?.querySelector<HTMLElement>("h1");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }, [View]);

    return <div ref={host} style={{ display: "contents" }}>
      {View ? <View {...props} /> : <MobileScroll className="app-screen">
        <main className="page-content pushed-page" data-testid="deferred-screen">
          <div className="page-heading"><h1>{title}</h1></div>
          {failed ? <>
            <p className="notice-banner" role="alert">Cet écran n’a pas pu être chargé. Vérifiez votre connexion, puis rechargez l’application. Vos données sont conservées.</p>
            {/* Browsers may cache a failed module import for this document.
                A verified save followed by reload clears that failure safely. */}
            <button type="button" className="primary-button full-button" disabled={reloading} aria-busy={reloading} onClick={() => void reload()}>{reloading ? "Sauvegarde…" : "Recharger l’application"}</button>
            {reloadError ? <p className="notice-banner" role="alert">{reloadError}</p> : null}
          </> : <p className="app-loading" role="status"><ReloadIcon className="spin" aria-hidden="true" /><span>Chargement de l’écran…</span></p>}
        </main>
      </MobileScroll>}
    </div>;
  };
}
