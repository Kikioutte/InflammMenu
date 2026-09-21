import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { MobileScroll } from "../mobile";

// The final guard is called synchronously just before reload: a change arriving
// between the save's resolution and this component's continuation still wins.
type ReloadControl = { beforeReload: () => Promise<() => boolean> };

/** Load a secondary screen on entry while retaining live props and navigation. */
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
    const reloadRevision = useRef(0);
    const mounted = useRef(true);
    const host = useRef<HTMLDivElement>(null);
    const restoreFocus = useRef(false);
    const isCurrent = () => Boolean(host.current?.closest('[data-flow-current="true"]'))
      && !host.current?.closest("[inert]");

    useEffect(() => {
      mounted.current = true;
      // FlowStack keeps covered/leaving scenes mounted. Leaving cancels this
      // reload even if the user returns before the asynchronous save finishes.
      const scene = host.current?.closest("[data-flow-current]");
      const observer = new MutationObserver(() => {
        // Any change cancels the attempt, including leave-and-return mutations
        // delivered together before this observer can inspect the final value.
        reloadRevision.current += 1;
      });
      if (scene) observer.observe(scene, { attributes: true, attributeFilter: ["data-flow-current"] });
      return () => {
        mounted.current = false;
        reloadRevision.current += 1;
        observer.disconnect();
      };
    }, []);

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
      if (reloadPending.current || !isCurrent()) return;
      const requestRevision = ++reloadRevision.current;
      const stillCurrent = () => mounted.current && requestRevision === reloadRevision.current && isCurrent();
      reloadPending.current = true;
      setReloading(true);
      setReloadError("");
      try {
        const canReload = await props.beforeReload();
        if (!stillCurrent()) return;
        if (canReload()) window.location.reload();
        else setReloadError("Des changements récents ont été détectés. Relancez le rechargement pour les conserver.");
      } catch {
        if (stillCurrent()) setReloadError("La sauvegarde n’a pas pu être vérifiée. L’application reste ouverte pour conserver vos changements. Vérifiez le stockage disponible et les réglages du navigateur, puis réessayez.");
      } finally {
        reloadPending.current = false;
        if (mounted.current) setReloading(false);
      }
    };

    useLayoutEffect(() => {
      // Transfer focus from the removed loading heading, but never steal it
      // from the persistent Back button or another screen.
      if (!View || !restoreFocus.current) return;
      restoreFocus.current = false;
      if (!isCurrent() || document.activeElement !== document.body) return;
      const heading = host.current?.querySelector<HTMLElement>("h1");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }, [View]);

    const { beforeReload: _beforeReload, ...viewProps } = props;
    return <div ref={host} style={{ display: "contents" }}>
      {View ? <View {...viewProps as Props} /> : <MobileScroll className="app-screen">
        <main className="page-content pushed-page" data-testid="deferred-screen">
          <div className="page-heading"><h1>{title}</h1></div>
          {failed ? <>
            <p className="notice-banner" role="alert">Cet écran n’a pas pu être chargé. Vérifiez votre connexion, puis rechargez l’application. Vos données sont conservées.</p>
            {/* Some browsers cache a rejected import until an explicit reload. */}
            <button type="button" className="primary-button full-button" disabled={reloading} aria-busy={reloading} onClick={() => void reload()}>{reloading ? "Sauvegarde…" : "Recharger l’application"}</button>
            {reloadError ? <p className="notice-banner" role="alert">{reloadError}</p> : null}
          </> : <p className="app-loading" role="status"><ReloadIcon className="spin" aria-hidden="true" /><span>Chargement de l’écran…</span></p>}
        </main>
      </MobileScroll>}
    </div>;
  };
}
