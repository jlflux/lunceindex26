import Icon, { type IconName } from "./Icon";

export default function EmptyState({
  title,
  body,
  icon = "database",
}: {
  title: string;
  body: string;
  icon?: IconName;
}) {
  return (
    <div className="card px-6 py-16 text-center">
      <span
        className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl"
        style={{
          background: "rgb(var(--surface-3))",
          color: "rgb(var(--text-faint))",
        }}
      >
        <Icon name={icon} size={20} />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p
        className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed"
        style={{ color: "rgb(var(--text-muted))" }}
      >
        {body}
      </p>
    </div>
  );
}
