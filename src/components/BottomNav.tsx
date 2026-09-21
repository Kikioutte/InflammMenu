import { HomeIcon, CalendarIcon, ReaderIcon, ArchiveIcon } from "@radix-ui/react-icons";
import { type TabId, type IconType } from "../app/types";

const navItems: Array<{ id: TabId; label: string; icon: IconType }> = [
  { id: "home", label: "Accueil", icon: HomeIcon },
  { id: "week", label: "Semaine", icon: CalendarIcon },
  { id: "recipes", label: "Recette", icon: ReaderIcon },
  { id: "courses", label: "Courses", icon: ArchiveIcon },
];

export function BottomNav({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {navItems.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" className={`bottom-nav__item ${active === id ? "is-active" : ""}`} aria-current={active === id ? "page" : undefined} onClick={() => onChange(id)}>
          <Icon className="bottom-nav__icon" /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
