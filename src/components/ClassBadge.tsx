import type { Classification } from "@/lib/types";

export default function ClassBadge({
  classification,
  region,
}: {
  classification: Classification;
  region?: number;
}) {
  return (
    <span className={`chip cls-${classification}`}>
      {classification}
      {region ? ` · R${region}` : ""}
    </span>
  );
}
