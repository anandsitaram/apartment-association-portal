import { useEffect, useState } from "react";
import { usePersistentState } from "../../usePersistentState.js";
import type {
  Method,
  Month,
  Rounding,
  Settings,
  SplitMode,
  Features,
} from "../../../shared/types";
import type { Save } from "../../api.js";
import ColumnsPanel from "../../components/ColumnsPanel.jsx";
import FeatureConfiguration from "./FeatureConfiguration.js";
import {
  DEFAULT_HEADS,
  SPLITS,
  billingOf,
  inr,
  maintOf,
  splitOf,
} from "../../../shared/lib.js";

// Expense heads: the lines offered when a month is created and in the Months tab's "Add from list" picker
function HeadEditor({
  heads,
  setHeads,
  amounts,
  setAmounts,
}: {
  heads: string[];
  setHeads: (heads: string[]) => void;
  amounts: Record<string, number>;
  setAmounts: (amounts: Record<string, number>) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const h = draft.trim().slice(0, 60);
    if (
      !h ||
      heads.some((x) => x.toLowerCase() === h.toLowerCase()) ||
      heads.length >= 30
    )
      return;
    setHeads([...heads, h]);
    setDraft("");
  };
  const remove = (h: string) => {
    setHeads(heads.filter((x) => x !== h));
    if (h in amounts) {
      const next = { ...amounts };
      delete next[h];
      setAmounts(next);
    }
  };
  const setAmount = (h: string, v: string) => {
    const n = +v;
    const next = { ...amounts };
    if (v.trim() === "" || !(n > 0)) delete next[h];
    else next[h] = n;
    setAmounts(next);
  };
  return (
    <div className="card">
      <h3>Expense heads</h3>
      <p className="muted">
        Expense lines offered for a month (e.g. Electricity, Water, Diesel). The
        first month starts with all of them; later months copy the previous
        month. Pick any head from the Expenses block on the Months tab with "Add
        from list". Give a head a fixed amount here if it never changes month to
        month (e.g. a flat security contract) — new rows added for that head
        start pre-filled with that amount instead of ₹0.
      </p>
      <div className="expense-head-list">
        {heads.map((h) => (
          <div className="expense-head-row" key={h}>
            <span className="expense-head-name">{h}</span>
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="No fixed amount"
              title={`Fixed amount for ${h} (blank = no fixed amount)`}
              value={amounts[h] ?? ""}
              onChange={(e) => setAmount(h, e.target.value)}
            />
            {heads.length > 1 && (
              <button
                type="button"
                title={`Remove ${h}`}
                onClick={() => remove(h)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="row">
        <input
          type="text"
          maxLength={60}
          placeholder="Add expense head"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button type="button" onClick={add}>
          + Add head
        </button>
        <button
          type="button"
          onClick={() => {
            setHeads(DEFAULT_HEADS);
            setAmounts({});
          }}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}

const METHODS: [Method, string][] = [
  ["divide", "Based on expected monthly expenses (total ÷ number of flats)"],
  ["common", "Common amount for all residents (₹)"],
  ["sqft", "Amount per sq ft (₹ × flat sq ft)"],
];

// Everything that is configuration rather than monthly data: organisation, billing (how maintenance and Corp
// Fund are worked out), expense heads and how a total payment is split.
export default function MaintenanceSettings({
  settings,
  months = [],
  onSave,
  superAdmin = false,
  admin = false,
  features,
  featureSystemAvailable = {},
}: {
  settings: Settings;
  months?: Month[];
  onSave: Save;
  superAdmin?: boolean;
  admin?: boolean;
  features?: Features;
  featureSystemAvailable?: Record<string, boolean>;
}) {
  const latest = months.at(-1);
  const b0 = billingOf(settings, latest);
  const headsOf = () =>
    Array.isArray(settings.expenseHeads) && settings.expenseHeads.length
      ? settings.expenseHeads
      : DEFAULT_HEADS;
  const [expenseHeads, setExpenseHeads] = useState(headsOf);
  const headAmountsOf = () => settings.expenseHeadAmounts || {};
  const [headAmounts, setHeadAmounts] = useState(headAmountsOf);
  const [paymentSplit, setPaymentSplit] = useState(splitOf(settings));
  const [org, setOrg] = useState({
    name: settings.orgName || "",
    short: settings.orgShort || "",
  });
  const [contactEmail, setContactEmail] = useState(settings.contactEmail || "");
  const [whatsappGroupName, setWhatsappGroupName] = useState(
    settings.whatsappGroupName || "",
  );
  const [whatsappGroupLink, setWhatsappGroupLink] = useState(
    settings.whatsappGroupLink || "",
  );
  const [method, setMethod] = useState(b0.method);
  const [vals, setVals] = useState<Record<string, number | string>>({
    divide: 25,
    common: 0,
    sqft: 0,
    [b0.method]: b0.value,
  });
  const [rounding, setRounding] = useState(b0.rounding);
  const [corpRate, setCorpRate] = useState(String(b0.corpValue ?? b0.corpRate));
  const [corpMethod, setCorpMethod] = useState<"sqft" | "common">(
    b0.corpMethod || "sqft",
  );
  const [corpRounding, setCorpRounding] = useState(b0.corpRounding);
  const [dueDay, setDueDay] = useState(String(settings.dueDay ?? 0));
  const [autoReminders, setAutoReminders] = useState(
    settings.autoReminders === true,
  );
  const [hallBookingAmount, setHallBookingAmount] = useState(
    String(settings.hallBookingAmount ?? 0),
  );
  const [totalFlats, setTotalFlats] = useState(
    String(settings.totalFlats ?? 0),
  );
  const [isBlocks, setIsBlocks] = useState(settings.isBlocks === true);
  const [allowAdminUserDeletion, setAllowAdminUserDeletion] = useState(
    settings.allowAdminUserDeletion !== false,
  );
  const [allowAdminFlatDeletion, setAllowAdminFlatDeletion] = useState(
    settings.allowAdminFlatDeletion !== false,
  );
  const [allowUsersViewAllFlats, setAllowUsersViewAllFlats] = useState(
    settings.allowUsersViewAllFlats === true,
  );
  const [tab, setTab] = usePersistentState<
    | "general"
    | "hall"
    | "billing"
    | "expenses"
    | "columns"
    | "contact"
    | "features"
  >("rv_settings_tab", "general");
  const [saving, setSaving] = useState<string | null>(null);
  const [columnScope, setColumnScope] = useState<"month" | "summary">("month");
  useEffect(() => {
    setExpenseHeads(headsOf());
    setHeadAmounts(headAmountsOf());
    setPaymentSplit(splitOf(settings));
    setOrg({ name: settings.orgName || "", short: settings.orgShort || "" });
    setContactEmail(settings.contactEmail || "");
    setWhatsappGroupName(settings.whatsappGroupName || "");
    setWhatsappGroupLink(settings.whatsappGroupLink || "");
    const b = billingOf(settings, latest);
    setMethod(b.method);
    setVals({ divide: 25, common: 0, sqft: 0, [b.method]: b.value });
    setRounding(b.rounding);
    setCorpRate(String(b.corpValue ?? b.corpRate));
    setCorpMethod(b.corpMethod || "sqft");
    setCorpRounding(b.corpRounding);
    setDueDay(String(settings.dueDay ?? 0));
    setAutoReminders(settings.autoReminders === true);
    setHallBookingAmount(String(settings.hallBookingAmount ?? 0));
    setTotalFlats(String(settings.totalFlats ?? 0));
    setIsBlocks(settings.isBlocks === true);
    setAllowAdminUserDeletion(settings.allowAdminUserDeletion !== false);
    setAllowAdminFlatDeletion(settings.allowAdminFlatDeletion !== false);
    setAllowUsersViewAllFlats(settings.allowUsersViewAllFlats === true);
  }, [
    JSON.stringify(settings.expenseHeads),
    JSON.stringify(settings.expenseHeadAmounts),
    settings.paymentSplit,
    settings.orgName,
    settings.orgShort,
    settings.contactEmail,
    settings.whatsappGroupName,
    settings.whatsappGroupLink,
    settings.dueDay,
    settings.autoReminders,
    settings.hallBookingAmount,
    settings.totalFlats,
    settings.isBlocks,
    settings.allowAdminUserDeletion,
    settings.allowAdminFlatDeletion,
    settings.allowUsersViewAllFlats,
    JSON.stringify(settings.billing),
  ]);
  const rateOk =
    corpRate.trim() !== "" && Number.isFinite(+corpRate) && +corpRate >= 0;
  const dueDayOk =
    dueDay.trim() !== "" &&
    Number.isInteger(+dueDay) &&
    +dueDay >= 0 &&
    +dueDay <= 31;
  const hallBookingAmountOk =
    hallBookingAmount.trim() !== "" &&
    Number.isFinite(+hallBookingAmount) &&
    +hallBookingAmount >= 0;
  const totalFlatsOk =
    totalFlats.trim() !== "" &&
    Number.isInteger(+totalFlats) &&
    +totalFlats >= 0 &&
    +totalFlats <= 10000;
  const draft = {
    method,
    value:
      method === "divide"
        ? Math.max(Number(settings.totalFlats) || 25, 1)
        : +vals[method] || 0,
    rounding,
    corp_rate: +corpRate || 0,
    corp_method: corpMethod,
    corp_value: +corpRate || 0,
  };
  const saveSection = async (
    section: string,
    sectionSettings: Record<string, unknown>,
  ) => {
    setSaving(section);
    try {
      await onSave({ action: "saveSettings", settings: sectionSettings });
    } finally {
      setSaving(null);
    }
  };
  const saveContact = () =>
    saveSection("contact", {
      contactEmail: contactEmail.trim(),
      whatsappGroupName: whatsappGroupName.trim(),
      whatsappGroupLink: whatsappGroupLink.trim(),
    });
  const saveGeneral = () =>
    saveSection("general", {
      orgName: org.name,
      orgShort: org.short,
      contactEmail: contactEmail.trim(),
      whatsappGroupName: whatsappGroupName.trim(),
      dueDay: dueDayOk ? +dueDay : 0,
      autoReminders,
      totalFlats: totalFlatsOk ? Math.trunc(+totalFlats) : 0,
      isBlocks,
      ...(superAdmin || admin ? { allowUsersViewAllFlats } : {}),
    });
  const saveHall = () =>
    saveSection("hall", {
      hallBookingAmount: hallBookingAmountOk ? +hallBookingAmount : 0,
    });
  const saveBilling = () =>
    saveSection("billing", {
      billing: {
        method,
        value:
          method === "divide"
            ? Math.max(Number(settings.totalFlats) || 25, 1)
            : +vals[method] || 0,
        rounding,
        corpRate: +corpRate,
        corpMethod,
        corpValue: +corpRate,
        corpRounding,
      },
    });
  const saveExpenses = () =>
    saveSection("expenses", {
      expenseHeads,
      expenseHeadAmounts: headAmounts,
      paymentSplit,
    });
  useEffect(() => {
    if (tab === "billing") setTab("expenses");
  }, [tab, setTab]);
  return (
    <div className="maintenance-settings settings-workspace">
      <div className="settings-intro">
        <p className="muted">
          Configure one area at a time. Each section saves independently, so you
          do not have to change or save unrelated settings.
        </p>
      </div>
      <nav
        className="settings-tabs"
        aria-label="Settings sections"
        role="tablist"
      >
        {[
          ["general", "General", "Organisation, community size & security"],
          ["hall", "Party Hall", "Booking amount"],
          ["expenses", "Expenses & Payments", "Expense heads & payment split"],
          ["columns", "Columns", "Month & Summary columns"],
          [
            "contact",
            "Contact & WhatsApp",
            "Contact email & urgent WhatsApp group",
          ],
          ...(superAdmin
            ? [["features", "Features", "Enable or disable optional modules"]]
            : []),
        ].map(([key, title, desc]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "settings-tab active" : "settings-tab"}
            onClick={() => setTab(key as typeof tab)}
            aria-selected={tab === key}
            role="tab"
          >
            <strong>{title}</strong>
            <span>{desc}</span>
          </button>
        ))}
      </nav>

      {tab === "features" && superAdmin && features && (
        <FeatureConfiguration
          features={features}
          systemAvailable={featureSystemAvailable}
          onSave={onSave}
        />
      )}

      {tab === "contact" && (
        <>
          <div className="card settings-section-card">
            <div className="settings-section-heading">
              <div>
                <h3>Contact Us</h3>
                <p className="muted">
                  Configure where Contact Us messages are delivered. Admins and
                  Super Admins can update these contact details.
                </p>
              </div>
            </div>
            <div className="settings-form-grid">
              <label className="settings-form-wide">
                <span>Contact email address</span>
                <input
                  type="email"
                  maxLength={160}
                  placeholder="e.g. office@example.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
                <small className="muted">
                  Messages submitted from Contact Us will be sent to this
                  address.
                </small>
              </label>
              <label className="settings-form-wide">
                <span>WhatsApp group name</span>
                <input
                  type="text"
                  maxLength={100}
                  placeholder="e.g. Sunrise Apartments Residents"
                  value={whatsappGroupName}
                  onChange={(e) => setWhatsappGroupName(e.target.value)}
                />
                <small className="muted">
                  Shown to residents for urgent matters.
                </small>
              </label>
              <label className="settings-form-wide">
                <span>WhatsApp group link</span>
                <input
                  type="url"
                  maxLength={500}
                  placeholder="https://chat.whatsapp.com/..."
                  value={whatsappGroupLink}
                  onChange={(e) => setWhatsappGroupLink(e.target.value)}
                />
                <small className="muted">
                  Optional. When provided, the WhatsApp urgent-matters message
                  becomes clickable.
                </small>
              </label>
            </div>
          </div>
          <div className="settings-savebar">
            <span className="muted">
              Only Contact & WhatsApp settings will be changed.
            </span>
            <button
              className="pri"
              disabled={
                saving === "contact" ||
                (!!contactEmail.trim() &&
                  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim()))
              }
              onClick={saveContact}
            >
              {saving === "contact" ? "Saving…" : "Save Contact settings"}
            </button>
          </div>
        </>
      )}

      {tab === "general" && (
        <>
          <fieldset>
            <div className="card settings-section-card">
              <div className="settings-section-heading">
                <div>
                  <h3>Organisation</h3>
                  <p className="muted">
                    Used for reports, Excel exports and reminders. The
                    application name shown on the login screen and app shell is
                    fixed as My Apartment.
                  </p>
                </div>
              </div>
              <div className="settings-form-grid">
                <label>
                  <span>Full name</span>
                  <input
                    type="text"
                    maxLength={80}
                    placeholder="e.g. Sunrise Apartments Owners Association"
                    value={org.name}
                    onChange={(e) => setOrg({ ...org, name: e.target.value })}
                  />
                </label>
                <label>
                  <span>Short name</span>
                  <input
                    type="text"
                    maxLength={30}
                    placeholder="e.g. Sunrise"
                    value={org.short}
                    onChange={(e) => setOrg({ ...org, short: e.target.value })}
                  />
                </label>
              </div>
              <p className="muted settings-cross-link">
                Contact email, WhatsApp group name and link are set on the{" "}
                <b>Contact &amp; WhatsApp</b> tab.
              </p>
            </div>
            <div className="card settings-section-card">
              <div className="settings-section-heading">
                <div>
                  <h3>Community size</h3>
                  <p className="muted">
                    Set the maximum number of flats. New flats automatically
                    appear in Months.
                  </p>
                </div>
                <span className="settings-hint">
                  {Number(totalFlats) > 0
                    ? `${totalFlats} flats configured`
                    : "No limit set"}
                </span>
              </div>
              <label className="opt">
                <span>Total number of flats</span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  inputMode="numeric"
                  value={totalFlats}
                  onChange={(e) => setTotalFlats(e.target.value)}
                  placeholder="e.g. 120"
                />
              </label>
            </div>
            <div className="card settings-section-card">
              <div className="settings-section-heading">
                <div>
                  <h3>Multi-block billing</h3>
                  <p className="muted">
                    Enable this only when your association has multiple
                    blocks/buildings. When enabled, block-specific expenses are
                    allocated only to flats in that block; association-wide
                    expenses remain shared. When disabled, billing follows the
                    normal single-association calculation.
                  </p>
                </div>
              </div>
              <label className="settings-toggle">
                <span>
                  <b>Is Blocks</b>
                  <small>
                    Off by default. Turn on to enable block fields and
                    block-specific expense allocation.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={isBlocks}
                  onChange={(e) => setIsBlocks(e.target.checked)}
                />
              </label>
            </div>
            <div className="card settings-section-card">
              <div className="settings-section-heading">
                <div>
                  <h3>Payment due date</h3>
                  <p className="muted">
                    Use 0 to disable due-date messages. Larger values use the
                    month's last day.
                  </p>
                </div>
              </div>
              <label className="opt">
                <span>Due day</span>
                <input
                  type="number"
                  min="0"
                  max="31"
                  step="1"
                  inputMode="numeric"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="settings-toggle">
                <span>
                  <b>Send overdue reminders automatically</b>
                  <small>
                    Once the due day has passed, unpaid flats get a reminder the
                    next morning and then weekly (up to 5 times). Needs a due
                    day and Notifications switched on.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={autoReminders}
                  onChange={(e) => setAutoReminders(e.target.checked)}
                />
              </label>
            </div>
            {(superAdmin || admin) && (
              <div className="card settings-section-card settings-security-card">
                <div className="settings-section-heading">
                  <div>
                    <h3>Account security</h3>
                    <p className="muted">
                      Control resident financial visibility and administrative
                      permissions.
                    </p>
                  </div>
                </div>
                <div className="settings-security-grid">
                  <label className="settings-toggle">
                    <span>
                      <b>Allow Flat Users to view all flats' financial data</b>
                      <small>
                        When enabled, Flat Users can see flat-wise maintenance
                        and Corpus Fund data for every flat on Dashboard and
                        Months. Names, phone numbers and email addresses remain
                        hidden. Off by default.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={allowUsersViewAllFlats}
                      onChange={(e) =>
                        setAllowUsersViewAllFlats(e.target.checked)
                      }
                    />
                  </label>
                  {superAdmin && (
                    <>
                      <label className="settings-toggle">
                        <span>
                          <b>Allow Admins to delete users</b>
                          <small>
                            Turn this off to restrict user deletion to Super
                            Admin only.
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={allowAdminUserDeletion}
                          onChange={(e) =>
                            setAllowAdminUserDeletion(e.target.checked)
                          }
                        />
                      </label>
                      <label className="settings-toggle">
                        <span>
                          <b>Allow Admins to delete flats</b>
                          <small>
                            Turn this off to restrict flat deletion to Super
                            Admin only.
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={allowAdminFlatDeletion}
                          onChange={(e) =>
                            setAllowAdminFlatDeletion(e.target.checked)
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="settings-savebar">
              <span className="muted">
                Only General settings will be changed.
              </span>
              <button
                className="pri"
                disabled={!dueDayOk || !totalFlatsOk || saving === "general"}
                onClick={saveGeneral}
              >
                {saving === "general" ? "Saving…" : "Save General settings"}
              </button>
            </div>
          </fieldset>
        </>
      )}

      {tab === "hall" && (
        <>
          <fieldset>
            <div className="card settings-section-card">
              <div className="settings-section-heading">
                <div>
                  <h3>Party Hall booking</h3>
                  <p className="muted">
                    Residents see this amount before requesting a slot.
                    Requesting a slot does not charge them.
                  </p>
                </div>
                <span className="settings-preview">
                  {inr(Number(hallBookingAmount) || 0)}
                </span>
              </div>
              <label className="opt">
                <span>Booking amount (₹)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={hallBookingAmount}
                  onChange={(e) => setHallBookingAmount(e.target.value)}
                />
              </label>
            </div>
            <div className="settings-savebar">
              <span className="muted">
                Only the Party Hall booking amount will be changed.
              </span>
              <button
                className="pri"
                disabled={!hallBookingAmountOk || saving === "hall"}
                onClick={saveHall}
              >
                {saving === "hall" ? "Saving…" : "Save Party Hall settings"}
              </button>
            </div>
          </fieldset>
        </>
      )}

      {tab === "billing" && (
        <>
          <fieldset>
            <div className="card settings-section-card">
              <div className="settings-section-heading">
                <div>
                  <h3>Billing</h3>
                  <p className="muted">
                    Set the monthly charges here. On the 1st, choose how to
                    calculate Maintenance and the Corp Fund for the month. Each
                    flat pays one combined amount; past months keep their saved
                    calculations.
                  </p>
                </div>
              </div>
              {METHODS.map(([k, l]) => (
                <label className="opt" key={k}>
                  <span>
                    <input
                      type="radio"
                      name="billing-method"
                      checked={method === k}
                      onChange={() => setMethod(k)}
                    />{" "}
                    {l}
                  </span>
                  {method === k && k !== "divide" && (
                    <input
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
                      className="calc-value"
                      value={vals[k]}
                      onChange={(e) =>
                        setVals({ ...vals, [k]: e.target.value })
                      }
                      aria-label={l}
                    />
                  )}
                </label>
              ))}
              <label className="opt">
                <span>Round off</span>
                <select
                  value={rounding}
                  onChange={(e) => setRounding(e.target.value as Rounding)}
                >
                  <option value="none">None (2 decimals)</option>
                  <option value="nearest">Nearest ₹1</option>
                  <option value="up">Round up to ₹1</option>
                </select>
              </label>
              <label className="opt">
                <span>
                  <b>Corp Fund calculation</b>
                </span>
                <select
                  value={corpMethod}
                  onChange={(e) =>
                    setCorpMethod(e.target.value as "sqft" | "common")
                  }
                >
                  <option value="sqft">Based on square feet</option>
                  <option value="common">Fixed amount per flat</option>
                </select>
              </label>
              <label className="opt">
                <span>
                  <b>
                    {corpMethod === "sqft"
                      ? "Corp Fund rate"
                      : "Corp Fund per flat"}
                  </b>{" "}
                  <span className="muted">
                    ({corpMethod === "sqft" ? "₹ per sq ft" : "₹ per flat"})
                  </span>
                </span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  className="calc-value"
                  value={corpRate}
                  onChange={(e) => setCorpRate(e.target.value)}
                />
              </label>
              <label className="opt">
                <span>Corp Fund rounding</span>
                <select
                  value={corpRounding}
                  onChange={(e) => setCorpRounding(e.target.value as Rounding)}
                >
                  <option value="none">None (2 decimals)</option>
                  <option value="nearest">Nearest ₹1</option>
                  <option value="up">Round up to ₹1</option>
                </select>
              </label>
              <div className="settings-example">
                {rateOk
                  ? `Example: 1,202 sq ft flat → maintenance ${inr(maintOf(draft, { bua: 1202 }))}, Corp Fund ${inr(corpRounding === "up" ? Math.ceil((corpMethod === "common" ? +corpRate : +corpRate * 1202) - 1e-9) : corpRounding === "none" ? Math.round((corpMethod === "common" ? +corpRate : +corpRate * 1202) * 100) / 100 : Math.round(corpMethod === "common" ? +corpRate : +corpRate * 1202))}`
                  : "Corp Fund amount must be a number (0 or more)"}
              </div>
            </div>
            <div className="settings-savebar">
              <span className="muted">
                Billing changes are applied separately from other settings.
              </span>
              <button
                className="pri"
                disabled={!rateOk || saving === "billing"}
                onClick={saveBilling}
              >
                {saving === "billing" ? "Saving…" : "Save Billing settings"}
              </button>
            </div>
          </fieldset>
        </>
      )}

      {tab === "expenses" && (
        <>
          <fieldset>
            <HeadEditor
              heads={expenseHeads}
              setHeads={setExpenseHeads}
              amounts={headAmounts}
              setAmounts={setHeadAmounts}
            />
            <div className="card settings-section-card">
              <div className="settings-section-heading">
                <div>
                  <h3>Actual Total Paid – how it is split</h3>
                  <p className="muted">
                    When an Actual Total Paid amount is entered, it is split
                    between Maintenance and Corpus Fund using this rule.
                  </p>
                </div>
              </div>
              {(Object.entries(SPLITS) as [SplitMode, string][]).map(
                ([k, l]) => (
                  <label className="opt" key={k}>
                    <span>
                      <input
                        type="radio"
                        name="paymentSplit"
                        checked={paymentSplit === k}
                        onChange={() => setPaymentSplit(k)}
                      />{" "}
                      {l}
                    </span>
                  </label>
                ),
              )}
            </div>
            <div className="settings-savebar">
              <span className="muted">
                Save expense heads and payment split together.
              </span>
              <button
                className="pri"
                disabled={saving === "expenses"}
                onClick={saveExpenses}
              >
                {saving === "expenses" ? "Saving…" : "Save Expenses settings"}
              </button>
            </div>
          </fieldset>
        </>
      )}

      {tab === "columns" && (
        <>
          <fieldset>
            <div className="card settings-section-card">
              <div className="settings-section-heading">
                <div>
                  <h3>Column visibility</h3>
                  <p className="muted">
                    Choose the columns and display names used by the selected
                    report. Flats columns are managed from the Flats page.
                  </p>
                </div>
              </div>
              <div
                className="settings-column-scope"
                role="tablist"
                aria-label="Column area"
              >
                <button
                  type="button"
                  className={columnScope === "month" ? "pri" : ""}
                  onClick={() => setColumnScope("month")}
                >
                  Month tabs
                </button>
                <button
                  type="button"
                  className={columnScope === "summary" ? "pri" : ""}
                  onClick={() => setColumnScope("summary")}
                >
                  Financial Summary
                </button>
              </div>
            </div>
            <ColumnsPanel
              scope={columnScope}
              settings={settings}
              onSave={onSave}
              onClose={() => {}}
              readOnly={false}
            />
          </fieldset>
        </>
      )}
    </div>
  );
}
