import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useLayoutEffect, useRef, type RefObject } from "react";

function availableForFocus(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element?.isConnected
    && !element.closest('[inert], [aria-hidden="true"]')
    && !element.matches(":disabled")
    && element.getClientRects().length
    && getComputedStyle(element).visibility !== "hidden");
}

/** Responsive web dialog used by the PWA outside the phone-only prototype runtime. */
export function WebSheet({ open, onOpenChange, returnFocusRef, title, description, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Explicit trigger, or the next logical control when closing changes the workflow. */
  returnFocusRef: RefObject<HTMLElement | null>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const sourceScreen = useRef<HTMLElement | null>(null);
  const isOpen = useRef(open);
  useLayoutEffect(() => { isOpen.current = open; }, [open]);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="web-sheet__overlay" />
      <Dialog.Content className="web-sheet__content"
        onOpenAutoFocus={() => {
          // A pointer click does not focus buttons on every browser (notably Safari).
          sourceScreen.current = returnFocusRef.current?.closest<HTMLElement>("[data-flow-current]") ?? null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // A new modal or a navigation owns its own focus; never restore behind it.
          if (isOpen.current || document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
            || (sourceScreen.current && sourceScreen.current.dataset.flowCurrent !== "true")) return;
          const active = document.activeElement;
          if (active instanceof HTMLElement && active !== document.body && availableForFocus(active)) return;
          if (availableForFocus(returnFocusRef.current)) {
            returnFocusRef.current.focus({ preventScroll: true });
            return;
          }
          const heading = sourceScreen.current?.querySelector<HTMLElement>("h1") ?? null;
          if (availableForFocus(heading)) {
            if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
          }
        }}>
        <div className="web-sheet__handle" aria-hidden="true" />
        <header className="web-sheet__header">
          <span>
            <Dialog.Title>{title}</Dialog.Title>
            {description ? <Dialog.Description>{description}</Dialog.Description> : null}
          </span>
          <Dialog.Close asChild>
            <button type="button" className="icon-button web-sheet__close" aria-label={`Fermer « ${title} »`}><Cross2Icon /></button>
          </Dialog.Close>
        </header>
        <div className="web-sheet__body">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
