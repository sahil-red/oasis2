import { readFile } from "node:fs/promises";

/** Minimal RFC4180-style CSV parser (quoted fields, commas). */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const records = parseCsvRecords(text);
  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0];
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const line = records[i];
    if (line.every((c) => !c.trim())) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = line[j] ?? "";
    }
    rows.push(row);
  }
  return { headers, rows };
}

function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || (c === "\r" && next === "\n")) {
      row.push(field);
      field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      if (c === "\r") i++;
      continue;
    }
    if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((x) => x.trim())) rows.push(row);
  }
  return rows;
}

export async function readCsvFile(path: string): Promise<{
  headers: string[];
  rows: Record<string, string>[];
}> {
  const text = await readFile(path, "utf8");
  return parseCsv(text);
}
