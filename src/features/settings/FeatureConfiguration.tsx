import { useEffect, useState } from "react";
import {
  FEATURE_DEFINITIONS,
  type ConfigurableFeature,
} from "../../../shared/features";
import type { Features } from "../../../shared/types";
import type { Save } from "../../api.js";
import { openConfirm } from "../../components/ui/appDialog.js";

export default function FeatureConfiguration({
  features,
  systemAvailable = {},
  onSave,
}: {
  features: Features;
  systemAvailable?: Record<string, boolean>;
  onSave: Save;
}) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<ConfigurableFeature, boolean>>(
    () =>
      Object.fromEntries(
        FEATURE_DEFINITIONS.map(({ key }) => [key, features[key] !== false]),
      ) as Record<ConfigurableFeature, boolean>,
  );
  useEffect(() => {
    setDraft(
      Object.fromEntries(
        FEATURE_DEFINITIONS.map(({ key }) => [key, features[key] !== false]),
      ) as Record<ConfigurableFeature, boolean>,
    );
  }, [features]);

  const toggle = async (key: ConfigurableFeature) => {
    const nextValue = !draft[key];
    if (!nextValue) {
      const ok = await openConfirm({
        title: `Disable ${FEATURE_DEFINITIONS.find((x) => x.key === key)?.label || "feature"}?`,
        message:
          "The feature will disappear from the navigation and its API actions will be rejected. Existing data is retained and will become available again if the feature is re-enabled.",
        confirmLabel: "Disable feature",
        danger: true,
      });
      if (!ok) return;
    }
    setDraft((d) => ({ ...d, [key]: nextValue }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ action: "saveFeatureConfig", features: draft });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="feature-config-workspace">
      <div className="card settings-section-card">
        <div className="settings-section-heading">
          <div>
            <h3>Feature availability</h3>
            <p className="muted">
              Control which optional modules are available to this apartment.
              Disabling a feature hides its menu and blocks its server actions;
              existing data is never deleted.
            </p>
          </div>
        </div>
        <div className="settings-security-grid">
          {FEATURE_DEFINITIONS.map(({ key, label, description }) => {
            const systemOk = systemAvailable[key] !== false;
            const checked = draft[key] && systemOk;
            return (
              <label className="settings-toggle" key={key}>
                <span>
                  <b>{label}</b>
                  <small>{description}</small>
                  {!systemOk && (
                    <small className="muted">
                      Unavailable at system level until the server capability is
                      enabled.
                    </small>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!systemOk}
                  onChange={() => toggle(key)}
                />
              </label>
            );
          })}
        </div>
      </div>
      <div className="settings-savebar">
        <span className="muted">
          Changes are audited with the previous and new values.
        </span>
        <button className="pri" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save Feature settings"}
        </button>
      </div>
    </div>
  );
}
