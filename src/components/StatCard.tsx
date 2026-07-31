import Icon, { type IconName } from "./Icon";

/**
 * Metric tile: icon chip, label, figure, and an optional trailing note.
 * `delta` is rendered in the good/bad colour by sign when supplied.
 */
export default function StatCard({
  icon,
  label,
  value,
  note,
  delta,
}: {
  icon: IconName;
  label: string;
  value: string;
  note?: string;
  delta?: number;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
          style={{
            background: "rgb(var(--surface-3))",
            color: "rgb(var(--text-muted))",
          }}
        >
          <Icon name={icon} size={15} />
        </span>
        <span
          className="truncate text-[13px] font-medium"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          {label}
        </span>
      </div>

      <div className="mt-3 text-[28px] font-extrabold leading-none tnum">
        {value}
      </div>

      {(note || delta !== undefined) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          {delta !== undefined && delta !== 0 && (
            <span
              className="inline-flex items-center gap-1 font-semibold"
              style={{
                color: delta > 0 ? "rgb(var(--good))" : "rgb(var(--bad))",
              }}
            >
              <Icon name={delta > 0 ? "trend-up" : "trend-down"} size={13} />
              {Math.abs(delta).toFixed(1)}
            </span>
          )}
          {note && (
            <span style={{ color: "rgb(var(--text-faint))" }}>{note}</span>
          )}
        </div>
      )}
    </div>
  );
}
