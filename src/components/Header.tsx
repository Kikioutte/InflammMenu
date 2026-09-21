import { ArrowLeftIcon } from "@radix-ui/react-icons";

export function Header({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return <div className="app-header"><button type="button" className="icon-button" aria-label="Retour" onClick={onBack}><ArrowLeftIcon /></button><strong>{title}</strong><span className="app-header__action">{action}</span></div>;
}
