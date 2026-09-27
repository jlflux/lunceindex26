/**
 * The filled pill the odds board uses, on its own so other pages can borrow
 * the look without borrowing the reasoning behind the colour.
 *
 * Deliberately dumb: it is handed a strength and a side and paints them. How a
 * number becomes those two things is a question about that number, and the two
 * callers answer it differently — the odds board scales each column against
 * its own best, because a 24% title chance and a 24% playoff chance are at
 * opposite ends of their columns; the standings scale against a fixed .500,
 * because a winning record and a losing one mean the same thing in every
 * region in the state.
 */
export default function StatPill({
  children,
  /** 0 = flat, 1 = the strongest this scale goes. */
  strength,
  /** Which end of the scale: the good one or the bad one. */
  hot,
  /** Nothing to say — no games yet. Renders unshaded rather than as a loss. */
  empty,
  title,
  className = "",
}: {
  children: React.ReactNode;
  strength: number;
  hot: boolean;
  empty?: boolean;
  title?: string;
  className?: string;
}) {
  const s = Math.max(0, Math.min(1, strength));
  const hue = hot ? "var(--odds-hi)" : "var(--odds-lo)";
  return (
    <span
      title={title}
      className={`inline-block rounded-md px-1.5 py-0.5 text-center font-bold tnum ${className}`}
      style={
        empty
          ? {
              background: "rgb(var(--surface-3))",
              color: "rgb(var(--text-faint))",
            }
          : {
              background: `rgb(${hue} / ${(0.12 + s * 0.78).toFixed(3)})`,
              // Near the middle of the scale, neither side gets colour. An
              // even record is not a good one, and tinting it because it
              // rounds up puts a thumb on the scale at exactly the point the
              // scale is supposed to be silent.
              color:
                s > 0.55
                  ? "#fff"
                  : hot && s > 0.12
                    ? "rgb(var(--odds-hi))"
                    : "rgb(var(--text-muted))",
            }
      }
    >
      {children}
    </span>
  );
}
