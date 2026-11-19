import { isAddress, zeroAddress } from "viem";

export const FIELDS = ["studentName", "studentId", "diplomaTitle", "issueDate", "grade", "recipientAddress"];
export const REQUIRED = ["studentName", "studentId", "diplomaTitle", "issueDate", "grade"];
const MAX_LEN = 200;

export function isValidIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Returns a list of human-readable problems (empty list = valid). */
export function validateRecord(rec) {
  const errors = [];
  for (const f of REQUIRED) {
    if (!String(rec[f] ?? "").trim()) errors.push(`${f} is required`);
  }
  for (const f of FIELDS) {
    if (String(rec[f] ?? "").length > MAX_LEN) errors.push(`${f} is longer than ${MAX_LEN} characters`);
  }
  if (rec.issueDate && !isValidIsoDate(rec.issueDate)) errors.push("issueDate must be YYYY-MM-DD");
  if (rec.recipientAddress && !isAddress(rec.recipientAddress)) {
    errors.push("recipientAddress is not a valid address");
  }
  return errors;
}

export const recipientOrZero = (rec) => (rec.recipientAddress ? rec.recipientAddress : zeroAddress);
