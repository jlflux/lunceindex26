/**
 * The asterisk beside a record that a forfeit has changed.
 *
 * Without it the board looks broken. Maplesville won its first four games and
 * then gave two of them up over an eligibility ruling, so it sits near the top
 * of 1A at 2-2 — which reads as a mistake unless the record says why. The
 * rating is right: the Index grades the football, and they won those games by
 * a combined seventy points.
 */
export default function ForfeitMark({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span
      className="ml-0.5 align-super text-[10px] font-bold"
      style={{ color: "rgb(var(--warn))" }}
      title={`Includes ${n} game${n === 1 ? "" : "s"} decided by forfeit. The Power Index still reads ${n === 1 ? "it" : "them"} as played.`}
    >
      *
    </span>
  );
}
