import * as XLSX from "xlsx";
import { FIELDS, REQUIRED, validateRecord } from "./validation";

const normalize = (h) => String(h).toLowerCase().replace(/[\s_\-]/g, "");
const CANONICAL = Object.fromEntries(FIELDS.map((f) => [normalize(f), f]));

function cellToString(v) {
  if (v instanceof Date) {
    // +12h makes the result immune to timezone drift (midnight local vs UTC).
    return new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
  }
  return String(v ?? "").trim();
}

/**
 * Reads a .xlsx / .xls / .csv File in the browser.
 * Returns { rows, fileErrors }. Each row = { line, data, errors }.
 */
export async function parseCertificateFile(file) {
  // CSV: read as UTF-8 text with raw=true, otherwise SheetJS "helpfully" converts
  // values such as 0xAbc... (hex numbers) or dates, which would corrupt addresses.
  const isCsv = /\.csv$/i.test(file.name);
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: "string", raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], fileErrors: ["The file contains no sheet."] };

  const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  if (json.length === 0) return { rows: [], fileErrors: ["The first sheet has no data rows."] };

  // Map the file's headers to our canonical field names.
  const headerMap = {};
  for (const h of Object.keys(json[0])) {
    const canonical = CANONICAL[normalize(h)];
    if (canonical) headerMap[h] = canonical;
  }
  const missing = REQUIRED.filter((f) => !Object.values(headerMap).includes(f));
  if (missing.length) {
    return { rows: [], fileErrors: [`Missing column(s): ${missing.join(", ")}`] };
  }

  const seen = new Map(); // "studentId|diploma" -> first line
  const rows = json.map((raw, i) => {
    const data = Object.fromEntries(FIELDS.map((f) => [f, ""]));
    for (const [h, v] of Object.entries(raw)) {
      if (headerMap[h]) data[headerMap[h]] = cellToString(v);
    }
    const line = i + 2; // +1 header, +1 because Excel starts at 1
    const errors = validateRecord(data);

    const key = `${data.studentId}|${data.diplomaTitle}`;
    if (data.studentId && data.diplomaTitle) {
      if (seen.has(key)) errors.push(`duplicate of line ${seen.get(key)}`);
      else seen.set(key, line);
    }
    return { line, data, errors };
  });

  return { rows, fileErrors: [] };
}
