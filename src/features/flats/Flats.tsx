import { useState, type ChangeEvent } from "react";
import { openConfirm } from "../../components/ui/appDialog.js";
import type { Flat } from "../../../shared/types";
import type { Save } from "../../api.js";
import { n2 } from "../../lib.js";
import ColumnsPanel from "../../components/ColumnsPanel.jsx";
import type { Settings } from "../../../shared/types";

type ColKey =
  | "sl"
  | "block"
  | "flat"
  | "name"
  | "type"
  | "bua"
  | "uds"
  | "phone"
  | "email"
  | "maintExcluded"
  | "corpExcluded";
const COLS: [ColKey, string, string | undefined, string][] = [
  ["sl", "SL", "number", "c-sl r"],
  ["block", "Block", "text", "c-block"],
  ["flat", "Flat No", undefined, "c-flat"],
  ["name", "Owner name", "text", "c-name"],
  ["type", "Apt Type", "text", "c-type"],
  ["bua", "Sq Ft", "number", "c-num r"],
  ["uds", "UDS", "number", "c-num r"],
  ["phone", "Phone", "tel", "c-phone"],
  ["email", "E-mail", "email", "c-email"],
  ["maintExcluded", "Maint. excluded", undefined, "c-incl"],
  ["corpExcluded", "Corp Fund excluded", undefined, "c-incl"],
];
const COL_WIDTHS: Record<ColKey | "act", number> = {
  sl: 56,
  block: 85,
  flat: 105,
  name: 220,
  type: 115,
  bua: 105,
  uds: 105,
  phone: 150,
  email: 240,
  maintExcluded: 105,
  corpExcluded: 105,
  act: 205,
};
const LIMIT: Partial<Record<ColKey, number>> = {
  name: 60,
  type: 30,
  phone: 20,
  email: 80,
};

interface FlatDraft {
  sl: string;
  block: string;
  name: string;
  type: string;
  bua: string;
  uds: string;
  phone: string;
  email: string;
  excluded: boolean;
  corpExcluded: boolean;
}

function FlatRow({
  f,
  onSave,
  admin,
  canDelete,
  onDelete,
  visibleKeys,
  onStatement,
}: {
  f: Flat;
  onSave: (draft: FlatDraft & { flat: string }) => Promise<boolean>;
  admin: boolean;
  canDelete: boolean;
  onDelete: (flat: string) => unknown;
  visibleKeys: ColKey[];
  onStatement?: (flat: string) => void;
}) {
  const init = (): FlatDraft => ({
    sl: String(f.sl),
    block: f.block || "",
    name: f.name || "",
    type: f.type || "",
    bua: String(f.bua),
    uds: String(f.uds),
    phone: f.phone || "",
    email: f.email || "",
    excluded: !!f.excluded,
    corpExcluded: !!f.corp_excluded,
  });
  const [v, setV] = useState(init);
  const dirty = JSON.stringify(v) !== JSON.stringify(init());
  const set = (k: ColKey) => (e: ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: e.target.value });
  return (
    <tr className={v.excluded ? "flat-excluded" : ""}>
      {COLS.filter(([k]) => visibleKeys.includes(k)).map(([k, , t, cls]) => (
        <td key={k} className={cls}>
          {k === "sl" ? (
            <span className="readonly-value">{v.sl}</span>
          ) : k === "flat" ? (
            <b>{f.flat}</b>
          ) : k === "maintExcluded" ? (
            <input
              type="checkbox"
              checked={v.excluded}
              onChange={(e) => setV({ ...v, excluded: e.target.checked })}
              aria-label={`Exclude flat ${f.flat} from maintenance calculation`}
              title="Applies from the latest month onwards"
            />
          ) : k === "corpExcluded" ? (
            <input
              type="checkbox"
              checked={v.corpExcluded}
              onChange={(e) => setV({ ...v, corpExcluded: e.target.checked })}
              aria-label={`Exclude flat ${f.flat} from Corp Fund`}
              title="Applies from the latest month onwards"
            />
          ) : (
            <input
              type={t}
              id={`${k}-${f.flat}`}
              name={`${k}-${f.flat}`}
              autoComplete="off"
              step={t === "number" ? "any" : undefined}
              inputMode={t === "number" ? "decimal" : undefined}
              maxLength={LIMIT[k]}
              value={v[k as keyof FlatDraft] as string}
              onChange={set(k)}
              aria-label={`${k} for flat ${f.flat}`}
            />
          )}
        </td>
      ))}
      <td className="c-act">
        <div className="flat-row-actions">
          <button
            className="pri"
            disabled={!dirty || !v.bua}
            onClick={() => onSave({ ...v, flat: f.flat })}
          >
            Save
          </button>
          {onStatement && (
            <button
              type="button"
              className="row-mini"
              onClick={() => onStatement(f.flat)}
              title="Print or save this flat's statement as PDF"
            >
              Statement
            </button>
          )}
          {admin && canDelete && (
            <button className="danger" onClick={() => onDelete(f.flat)}>
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function Flats({
  flats,
  onSave,
  admin,
  superAdmin = false,
  settings,
  onStatement,
  onOpenBulk,
}: {
  flats: Flat[];
  onSave: Save;
  admin: boolean;
  superAdmin?: boolean;
  settings: Settings;
  onStatement?: (flat: string) => void;
  onOpenBulk?: () => void;
}) {
  const save = (f: FlatDraft & { flat: string }) =>
    onSave({
      action: "saveFlat",
      create: false,
      flat: f.flat,
      sl: f.sl,
      block: f.block,
      name: f.name,
      type: f.type,
      bua: f.bua,
      uds: f.uds,
      phone: f.phone,
      email: f.email,
      excluded: f.excluded,
      corpExcluded: f.corpExcluded,
    });
  const del = async (flat: string) => {
    if (admin && !superAdmin && settings.allowAdminFlatDeletion === false) {
      await openConfirm({
        title: "Flat deletion is disabled",
        message:
          "Only Super Admin can delete flats while this security setting is turned off.",
        confirmLabel: "Close",
      });
      return;
    }
    if (
      await openConfirm({
        title: `Delete flat ${flat}?`,
        message:
          "Its recorded payments across all months will also be removed. This cannot be undone.",
        confirmLabel: "Delete flat",
        danger: true,
      })
    )
      await onSave({ action: "deleteFlat", flat });
  };
  const [showCols, setShowCols] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newFlat, setNewFlat] = useState({
    flat: "",
    block: "",
    name: "",
    type: "",
    bua: "",
    uds: "0",
    phone: "",
    email: "",
  });

  const hidden = new Set(settings.flatHidden || []);
  const visibleKeys = COLS.map(([k]) => k).filter(
    (k) => k === "flat" || !hidden.has(k),
  );
  const totalFlats = Number(settings.totalFlats || 0);
  const filteredFlats = flats.filter(
    (f) =>
      selectedBlock === "all" ||
      (selectedBlock === "__unassigned"
        ? !String(f.block || "").trim()
        : String(f.block || "").trim() === selectedBlock),
  );
  const canAddFlat = !totalFlats || flats.length < totalFlats;
  const addFlat = async () => {
    if (!newFlat.flat.trim() || !newFlat.bua.trim()) return;
    const ok = await onSave({
      action: "saveFlat",
      create: true,
      flat: newFlat.flat.trim(),
      block: newFlat.block.trim(),
      sl: flats.length + 1,
      name: newFlat.name.trim(),
      type: newFlat.type.trim(),
      bua: newFlat.bua,
      uds: newFlat.uds || "0",
      phone: newFlat.phone.trim(),
      email: newFlat.email.trim(),
      excluded: false,
      corpExcluded: false,
    });
    if (ok) {
      setNewFlat({
        flat: "",
        block: "",
        name: "",
        type: "",
        bua: "",
        uds: "0",
        phone: "",
        email: "",
      });
      setShowAdd(false);
    }
  };
  return (
    <>
      <div className="row titlebar flats-toolbar">
        <div>
          <h2>Flats</h2>
          <p className="muted">
            Choose which columns are visible. Flat No stays visible because it
            identifies the payment records.
          </p>
        </div>
        <div className="flats-toolbar-actions">
          <span className="muted flats-count">
            {selectedBlock === "all"
              ? flats.length
              : `${filteredFlats.length} of ${flats.length}`}
            {totalFlats ? ` / ${totalFlats}` : ""} flats
          </span>
          <button className="no-print" onClick={() => setShowCols((v) => !v)}>
            ⚙ Columns
          </button>
          <button
            className="pri no-print"
            disabled={!canAddFlat}
            onClick={() => setShowAdd((v) => !v)}
          >
            + Add flat
          </button>
        </div>
      </div>
      {admin && onOpenBulk && (
        <p className="muted no-print">
          Bulk import and export of flat data (Excel template) now lives under{" "}
          <button type="button" className="link-btn" onClick={onOpenBulk}>
            Flat User Management
          </button>
          .
        </p>
      )}
      <div
        className="row no-print flats-block-filter"
        style={{ margin: "8px 0 12px", justifyContent: "flex-end" }}
      >
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          Block
          <select
            value={selectedBlock}
            onChange={(e) => setSelectedBlock(e.target.value)}
          >
            <option value="all">All blocks</option>
            {[
              ...new Set(
                flats.map((f) => (f.block || "").trim()).filter(Boolean),
              ),
            ]
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
              .map((block) => (
                <option key={block} value={block}>
                  {block}
                </option>
              ))}
            {flats.some((f) => !String(f.block || "").trim()) && (
              <option value="__unassigned">No block assigned</option>
            )}
          </select>
        </label>
      </div>
      {showCols && (
        <ColumnsPanel
          scope="flats"
          settings={settings}
          onSave={onSave}
          onClose={() => setShowCols(false)}
        />
      )}
      {showAdd && (
        <div className="card flat-add-card">
          <div className="row titlebar">
            <div>
              <h3>Add flat</h3>
              <p className="muted">
                New flats automatically become available in the Months payment
                table.
              </p>
            </div>
          </div>
          <div className="flat-add-grid">
            <label>
              Flat No
              <input
                value={newFlat.flat}
                onChange={(e) =>
                  setNewFlat({ ...newFlat, flat: e.target.value })
                }
                placeholder="101-3BHK"
              />
            </label>
            <label>
              Block
              <input
                value={newFlat.block}
                onChange={(e) =>
                  setNewFlat({ ...newFlat, block: e.target.value })
                }
                placeholder="A or C"
              />
            </label>
            <label>
              Owner name
              <input
                value={newFlat.name}
                onChange={(e) =>
                  setNewFlat({ ...newFlat, name: e.target.value })
                }
              />
            </label>
            <label>
              Apt Type
              <input
                value={newFlat.type}
                onChange={(e) =>
                  setNewFlat({ ...newFlat, type: e.target.value })
                }
              />
            </label>
            <label>
              Sq Ft
              <input
                type="number"
                min="0.01"
                value={newFlat.bua}
                onChange={(e) =>
                  setNewFlat({ ...newFlat, bua: e.target.value })
                }
              />
            </label>
            <label>
              UDS
              <input
                type="number"
                min="0"
                value={newFlat.uds}
                onChange={(e) =>
                  setNewFlat({ ...newFlat, uds: e.target.value })
                }
              />
            </label>
            <label>
              Phone
              <input
                value={newFlat.phone}
                onChange={(e) =>
                  setNewFlat({ ...newFlat, phone: e.target.value })
                }
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={newFlat.email}
                onChange={(e) =>
                  setNewFlat({ ...newFlat, email: e.target.value })
                }
              />
            </label>
          </div>
          <div
            className="row"
            style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}
          >
            <button className="btn-secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
            <button
              className="pri"
              disabled={!newFlat.flat.trim() || !newFlat.bua.trim()}
              onClick={addFlat}
            >
              Add flat
            </button>
          </div>
        </div>
      )}
      <div className="scroll">
        <table
          className="flats-table"
          style={{
            tableLayout: "fixed",
            width: `${visibleKeys.reduce((total, key) => total + COL_WIDTHS[key], COL_WIDTHS.act)}px`,
          }}
        >
          <colgroup>
            {COLS.filter(([k]) => visibleKeys.includes(k)).map(([k]) => (
              <col
                key={k}
                className={`col-${k}`}
                style={{ width: `${COL_WIDTHS[k]}px` }}
              />
            ))}
            <col className="col-act" style={{ width: `${COL_WIDTHS.act}px` }} />
          </colgroup>
          <thead>
            <tr>
              {COLS.filter(([k]) => visibleKeys.includes(k)).map(
                ([k, l, , cls]) => (
                  <th key={k} className={cls}>
                    {l}
                  </th>
                ),
              )}
              <th className="c-act" />
            </tr>
          </thead>
          <tbody>
            {filteredFlats.map((f) => (
              <FlatRow
                key={[
                  f.flat,
                  f.block,
                  f.sl,
                  f.name,
                  f.type,
                  f.bua,
                  f.uds,
                  f.phone,
                  f.email,
                ].join("|")}
                f={f}
                onSave={save}
                admin={admin}
                canDelete={
                  admin &&
                  (superAdmin || settings.allowAdminFlatDeletion !== false)
                }
                onDelete={del}
                visibleKeys={visibleKeys}
                onStatement={onStatement}
              />
            ))}
          </tbody>
          <tfoot>
            <tr>
              {visibleKeys.map((k) =>
                k === "flat" ? (
                  <td key={k}>{flats.length} flats</td>
                ) : k === "bua" ? (
                  <td key={k} className="r">
                    {n2(flats.reduce((s, f) => s + f.bua, 0))}
                  </td>
                ) : k === "uds" ? (
                  <td key={k} className="r">
                    {n2(flats.reduce((s, f) => s + f.uds, 0))}
                  </td>
                ) : (
                  <td key={k} />
                ),
              )}
              <td className="c-act" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="legend">
        Edit a row and press Save. Changes apply to every month and the
        Financial Summary straight away. Flat No cannot be changed (payments are
        stored under it). Names, phone numbers and e-mail addresses are only
        visible to admins. Tick "Maint. excluded" or "Corp Fund excluded" to
        leave a flat out of that calculation. Saving applies it to the latest
        month and to every month you add afterwards; earlier months keep their
        own selection (change a specific month on the Months tab).
      </p>
    </>
  );
}
