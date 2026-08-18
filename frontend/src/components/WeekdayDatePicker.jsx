import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Same 0=Monday..6=Sunday convention as DAY_NAMES in utils/timezone.js --
 * keeps this component's `dayOfWeek` prop consistent with the
 * availability-block data it's always paired with. */
function jsDateToIsoDow(date) {
  return (date.getDay() + 6) % 7;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** A month-grid calendar where only dates matching `dayOfWeek` are
 * selectable -- used for picking a specific occurrence of a recurring
 * weekly availability block (see BookingPage.jsx), rather than a free-for-
 * all date picker that would let you pick a day the other person was never
 * actually available on. No date library (kept minimal per the project's
 * existing convention, see utils/timezone.js's docstring) -- just native
 * Date math, same approach as the rest of the app. */
export default function WeekdayDatePicker({ dayOfWeek, selectedDate, onSelect }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const leadingBlanks = jsDateToIsoDow(firstOfMonth);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function dateStrFor(day) {
    return `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
  }

  function isSelectable(day) {
    const cellDate = new Date(viewYear, viewMonth, day);
    if (cellDate < today) return false;
    return jsDateToIsoDow(cellDate) === dayOfWeek;
  }

  const isAtCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  function goPrevMonth() {
    if (isAtCurrentMonth) return;
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }
  function goNextMonth() {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }

  return (
    <div className="date-picker">
      <div className="date-picker-header">
        <button
          type="button"
          className="date-picker-nav"
          onClick={goPrevMonth}
          disabled={isAtCurrentMonth}
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="date-picker-month">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" className="date-picker-nav" onClick={goNextMonth} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="date-picker-weekdays">
        {WEEKDAY_HEADERS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="date-picker-grid">
        {cells.map((day, i) => {
          if (day === null) return <span key={`blank-${i}`} />;
          const dateStr = dateStrFor(day);
          const selectable = isSelectable(day);
          return (
            <button
              type="button"
              key={dateStr}
              className={`date-picker-cell${dateStr === selectedDate ? " selected" : ""}`}
              disabled={!selectable}
              onClick={() => onSelect(dateStr)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
