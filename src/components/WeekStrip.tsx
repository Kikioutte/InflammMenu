import { formatWeekRange, dateAt } from "./format";
import { DAY_LABELS } from "./constants";

export function WeekStrip({ startsOn, selected, onSelect, compact = false }: { startsOn: string; selected: number; onSelect?: (index: number) => void; compact?: boolean }) {
  const className = `week-strip ${compact ? "week-strip--compact" : ""}`;
  const label = `Semaine du ${formatWeekRange(startsOn)}`;
  if (!onSelect) {
    return (
      <div className={className} aria-label={label} role="list">
        {DAY_LABELS.map((short, index) => (
          <span key={short} role="listitem" className={`week-day ${selected === index ? "is-today" : ""}`} aria-label={`${short} ${dateAt(startsOn, index).getDate()}`} aria-current={selected === index ? "date" : undefined}>
            <span>{short}</span><strong>{dateAt(startsOn, index).getDate()}</strong><i aria-hidden="true" />
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className={className} aria-label={label}>
      {DAY_LABELS.map((short, index) => (
        <button key={short} type="button" className={`week-day ${selected === index ? "is-today" : ""}`} aria-label={`${short} ${dateAt(startsOn, index).getDate()}`} aria-current={selected === index ? "date" : undefined} onClick={() => onSelect(index)}>
          <span>{short}</span><strong>{dateAt(startsOn, index).getDate()}</strong><i aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
