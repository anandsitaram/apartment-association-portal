import type { ReactNode } from "react";

export interface DataColumn<T = unknown> {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  width?: string;
  render?: (row: T) => ReactNode;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  className = "",
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <div className="data-table-wrap">
      <table className={`data-table ${className}`}>
        <colgroup>
          {columns.map((column) => (
            <col
              key={column.key}
              style={column.width ? { width: column.width } : undefined}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`align-${column.align || "left"}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={rowKey(row, index)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`align-${column.align || "left"}`}
                  >
                    {column.render
                      ? column.render(row)
                      : String((row as any)[column.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{empty || "No records found."}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
