import { useState } from "react";
import type { CustomColumn, Settings } from "../../shared/types";
import type { Save } from "../api.js";
import { FHEAD, HEAD, SHEAD, S_NOTE } from "../columns.js";

// scope "month": columns of every month tab (+ custom columns) · scope "summary": Summary "Payments by flat" table.
// Both scopes share one settings record; each panel only shows its own columns but saves the whole record.
export default function ColumnsPanel({
  scope,
  settings,
  onSave,
  onClose,
  readOnly = false,
}: {
  scope: "month" | "summary" | "flats";
  settings: Settings;
  onSave: Save;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const summary = scope === "summary";
  const flats = scope === "flats";
  const heads = summary ? SHEAD : flats ? FHEAD : HEAD;
  const [hidden, setHidden] = useState<string[]>(
    flats ? settings.flatHidden || [] : settings.hidden || [],
  );
  const [labels, setLabels] = useState<Record<string, string>>(
    settings.labels || {},
  );
  const [custom, setCustom] = useState<CustomColumn[]>(settings.custom || []);
  const [nm, setNm] = useState("");
  const locked = (k: string) => k === "flat" || k === "s_flat"; // the flat number is the row key: always shown
  const toggle = (k: string) =>
    setHidden(
      hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k],
    );
  const add = () => {
    const n = nm.trim();
    if (n && custom.length < 10) {
      setCustom([...custom, { id: "c" + Date.now().toString(36), name: n }]);
      setNm("");
    }
  };
  const clean = (o: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(o)
        .map(([k, v]): [string, string] => [k, (v || "").trim()])
        .filter(([, v]) => v),
    );
  return (
    <div className="card">
      <b>
        {summary ? "Summary" : flats ? "Flats" : "Month tabs"} columns – tick to
        show, untick to hide, type a name to rename
      </b>
      {Object.entries(heads).map(([k, l]) => (
        <div className="colrow" key={k}>
          <label className="chip">
            <input
              type="checkbox"
              disabled={readOnly || locked(k)}
              checked={locked(k) || !hidden.includes(k)}
              onChange={() => toggle(k)}
            />{" "}
            {l}
          </label>
          <input
            placeholder="Display name (blank = default)"
            maxLength={40}
            value={labels[k] || ""}
            onChange={(e) => setLabels({ ...labels, [k]: e.target.value })}
          />
          {S_NOTE[k] && <span className="muted">{S_NOTE[k]}</span>}
        </div>
      ))}
      {!summary && !flats && (
        <>
          <b>Custom columns</b>
          {custom.map((c) => (
            <div className="colrow" key={c.id}>
              <input
                maxLength={40}
                value={c.name}
                onChange={(e) =>
                  setCustom(
                    custom.map((x) =>
                      x.id === c.id ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                onClick={() => setCustom(custom.filter((x) => x.id !== c.id))}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="row">
            <input
              placeholder="New column name (e.g. Remarks)"
              value={nm}
              onChange={(e) => setNm(e.target.value)}
            />
            <button onClick={add}>+ Add</button>
          </div>
        </>
      )}
      <div className="row">
        <button onClick={onClose}>Cancel</button>
        <button
          className="pri"
          onClick={() =>
            onSave({
              action: "saveSettings",
              settings: {
                ...settings,
                ...(flats ? { flatHidden: hidden } : { hidden }),
                custom: custom.filter((c) => c.name.trim()),
                labels: clean(labels),
              },
            }).then((ok) => ok && onClose())
          }
        >
          Save columns
        </button>
      </div>
    </div>
  );
}
