import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { apiJson } from "../api/client";

/** A curated starter list so the dropdown has something useful to show
 * before the user has typed anything (or typed very little) -- not meant
 * to be exhaustive, just common enough that most people find something
 * relevant to click instead of typing the full name out. Real matches
 * from the actual skill catalog (GET /api/skills?q=) always take
 * priority once there's enough text to search on. */
const COMMON_SKILLS = [
  "Python", "JavaScript", "Guitar", "Piano", "Spanish", "French",
  "Public Speaking", "Excel", "Photography", "Cooking", "Yoga",
  "Graphic Design", "Creative Writing", "Video Editing", "SQL", "UI Design",
  "Watercolor Painting", "Chess", "Personal Finance", "Marketing",
  "Data Analysis", "Web Development", "Singing", "Baking", "Drawing",
  "Woodworking", "Meditation", "Resume Writing", "German", "Mandarin",
];

const DEBOUNCE_MS = 250;

/** A text input styled like every other .field input (via the standalone
 * .input class), with a suggestion dropdown underneath: the real skill
 * catalog once you've typed a couple characters (via the existing
 * GET /api/skills?q= search), blended with a curated "common skills" list
 * so there's always something to pick from instead of a blank box -- plus
 * an explicit "Add '<query>'" row when what's typed isn't already in the
 * list, so it's obvious you're not limited to the suggestions. Controlled
 * -- the parent owns the text value, this just adds the dropdown UX
 * around it. */
export default function SkillAutocompleteInput({ id, value, onChange, onSelect, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const blurTimeoutRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = value.trim();
    const localMatches = COMMON_SKILLS.filter((s) => s.toLowerCase().includes(query.toLowerCase()));

    if (!query) {
      setSuggestions(localMatches.slice(0, 8));
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const catalogMatches = await apiJson(`/api/skills?q=${encodeURIComponent(query)}`);
        const catalogNames = new Set(catalogMatches.map((s) => s.name.toLowerCase()));
        const extras = localMatches.filter((s) => !catalogNames.has(s.toLowerCase()));
        setSuggestions([...catalogMatches.map((s) => s.name), ...extras].slice(0, 8));
      } catch {
        setSuggestions(localMatches.slice(0, 8));
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [value]);

  function pick(name) {
    clearTimeout(blurTimeoutRef.current);
    onChange(name);
    onSelect?.(name);
    setOpen(false);
  }

  const query = value.trim();
  const isExactMatch = suggestions.some((s) => s.toLowerCase() === query.toLowerCase());
  const showAddRow = query.length > 0 && !isExactMatch;

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        id={id}
        className="input"
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a click on a suggestion registers before the
          // dropdown unmounts (blur fires first on most browsers).
          blurTimeoutRef.current = setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && (suggestions.length > 0 || showAddRow) && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 30,
            padding: "var(--space-2)",
            maxHeight: 260,
            overflowY: "auto",
            boxShadow: "var(--shadow-hover)",
          }}
        >
          {!query && <p className="eyebrow" style={{ padding: "0 var(--space-2)", marginBottom: "var(--space-1)" }}>Popular skills</p>}
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              className="suggestion-item"
              onClick={() => pick(name)}
              onMouseDown={(e) => e.preventDefault()} // keep focus on the input so onBlur's timeout, not an early blur, governs closing
            >
              {name}
            </button>
          ))}
          {showAddRow && (
            <button
              type="button"
              className="suggestion-item suggestion-item-add"
              onClick={() => pick(query)}
              onMouseDown={(e) => e.preventDefault()}
              style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
            >
              <Plus size={14} />
              Add "{query}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
