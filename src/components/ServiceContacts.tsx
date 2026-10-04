import { useEffect, useState } from "react";
import type { Settings } from "../../shared/types";
import type { Save } from "../api.js";

type Contact = NonNullable<Settings["serviceContacts"]>[number];
const blank = (): Contact => ({
  id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  category: "Electrician",
  name: "",
  phone: "",
  notes: "",
});

export default function ServiceContacts({
  settings,
  admin,
  onSave,
}: {
  settings: Settings;
  admin: boolean;
  onSave: Save;
}) {
  const [rows, setRows] = useState<Contact[]>(settings.serviceContacts || []);
  const [saving, setSaving] = useState(false);
  useEffect(
    () => setRows(settings.serviceContacts || []),
    [settings.serviceContacts],
  );
  const update = (id: string, field: keyof Contact, value: string) =>
    setRows((old) =>
      old.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        action: "saveSettings",
        settings: {
          ...settings,
          serviceContacts: rows.filter((r) => r.name.trim() && r.phone.trim()),
        },
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="service-contacts-page">
      <h2>Service Contacts</h2>
      <p className="muted">
        Quickly find trusted electricians, plumbers, carpenters and other
        service providers.
      </p>
      {admin && (
        <div className="row">
          <button
            type="button"
            onClick={() => setRows((old) => [...old, blank()])}
          >
            + Add contact
          </button>
          <button
            className="pri"
            type="button"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save contacts"}
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="card">
          <b>No service contacts added yet</b>
          <p className="muted">
            An Admin can add contact names and phone numbers here.
          </p>
        </div>
      ) : (
        <div className="service-contact-grid">
          {rows.map((c) => (
            <div className="card service-contact-card" key={c.id}>
              {admin ? (
                <>
                  <label>
                    Service type
                    <select
                      value={c.category}
                      onChange={(e) => update(c.id, "category", e.target.value)}
                    >
                      {[
                        "Electrician",
                        "Plumber",
                        "Carpenter",
                        "Painter",
                        "AC technician",
                        "Appliance repair",
                        "Internet",
                        "Other",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Name
                    <input
                      value={c.name}
                      onChange={(e) => update(c.id, "name", e.target.value)}
                      placeholder="Contact name"
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      type="tel"
                      value={c.phone}
                      onChange={(e) => update(c.id, "phone", e.target.value)}
                      placeholder="Phone number"
                    />
                  </label>
                  <label>
                    Notes
                    <input
                      value={c.notes || ""}
                      onChange={(e) => update(c.id, "notes", e.target.value)}
                      placeholder="Availability / specialty"
                    />
                  </label>
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      setRows((old) => old.filter((r) => r.id !== c.id))
                    }
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <span className="badge">{c.category}</span>
                  <h3>{c.name}</h3>
                  <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}>
                    {c.phone}
                  </a>
                  {c.notes && <p className="muted">{c.notes}</p>}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {admin && rows.length > 0 && (
        <button
          className="pri"
          type="button"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save contacts"}
        </button>
      )}
    </section>
  );
}
