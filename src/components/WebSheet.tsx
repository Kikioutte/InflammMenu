import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";

/** Responsive web dialog used by the PWA outside the phone-only prototype runtime. */
export function WebSheet({ open, onOpenChange, title, description, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="web-sheet__overlay" />
      <Dialog.Content className="web-sheet__content">
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
