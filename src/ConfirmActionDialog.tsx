import { useRef, useState } from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
import * as Dialog from "@radix-ui/react-dialog";

/** Destructive actions stay reversible until this accessible confirmation. */
export function ConfirmActionDialog({ trigger, title, description, confirmLabel, testId, onConfirm, children }: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  testId: string;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const changeOpen = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    if (next) setError("");
  };
  const confirm = async () => {
    setPending(true);
    setError("");
    try {
      await onConfirm();
      setOpen(false);
    } catch (confirmationError) {
      setError(confirmationError instanceof Error
        ? confirmationError.message
        : "L’action n’a pas pu être effectuée. Vos données sont conservées.");
    } finally {
      setPending(false);
    }
  };
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="confirm-dialog__overlay" />
      <Dialog.Content
        className="confirm-dialog__content"
        role="alertdialog"
        data-testid={testId}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }}
      >
        <Cross2Icon className="confirm-dialog__icon" aria-hidden="true" />
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description>{description}</Dialog.Description>
        {children ? <div className="confirm-dialog__extra">{children}</div> : null}
        {error ? <p className="confirm-dialog__error" role="alert">{error}</p> : null}
        <div className="confirm-dialog__actions">
          <Dialog.Close asChild>
            <button ref={cancelRef} type="button" className="secondary-button" data-testid={`${testId}-cancel`} disabled={pending}>Annuler</button>
          </Dialog.Close>
          <button type="button" className="danger-button" data-testid={`${testId}-confirm`} disabled={pending} onClick={() => void confirm()}>{pending ? "Traitement…" : confirmLabel}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

