import DatePicker from "./DatePicker.jsx";
import TimePicker from "./TimePicker.jsx";

// "YYYY-MM-DDTHH:mm" value, built from the same DatePicker and TimePicker used everywhere else
export default function DateTimePicker({
  value,
  onChange,
  label = "date and time",
  allowPast = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  allowPast?: boolean;
}) {
  const [date = "", time = "09:00"] = value ? value.split("T") : [];
  return (
    <div className="datetime-picker">
      <DatePicker
        value={date}
        allowPast={allowPast}
        label={`Select ${label} (date)`}
        onChange={(d) => onChange(`${d}T${time.slice(0, 5)}`)}
      />
      <TimePicker
        value={time.slice(0, 5)}
        label={`Select ${label} (time)`}
        onChange={(t) => onChange(`${date}T${t}`)}
      />
    </div>
  );
}
