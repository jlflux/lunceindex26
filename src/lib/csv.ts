/**
 * Runtime-agnostic delimited-text parsing (no fs), shared by the browser and
 * API routes. Handles quoted fields containing the delimiter, quotes and
 * newlines.
 *
 * Tabs are supported for the same reason commas are: selecting a Google Sheet
 * and copying it puts tab-separated text on the clipboard, with the same
 * quoting rules, and a stadium name wrapped across two lines inside a quoted
 * cell must not be read as two rows.
 */
export function parseCsvText(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}
