import { useMemo, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { useRegistry, useRegistryWriter } from "../registry";
import { parseCertificateFile } from "../utils/parseExcel";
import { recipientOrZero } from "../utils/validation";
import { explainError } from "../utils/errors";
import { shortAddr, shortHash } from "../utils/format";
import TxResult from "./TxResult";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function statusOf(r) {
  if (r.status === "minted") return { text: `Issued #${r.certId}`, cls: "ok" };
  if (r.status === "failed") return { text: r.error, cls: "err" };
  if (r.errors.length) return { text: r.errors.join("; "), cls: "err" };
  if (r.existingId) return { text: `Already on-chain (#${r.existingId})`, cls: "warn" };
  return { text: "Ready", cls: "" };
}

const selectable = (r) => !r.errors.length && !r.existingId && r.status !== "minted";

export default function ExcelImport({ onVerify }) {
  const { chainId, address, abi } = useRegistry();
  const publicClient = usePublicClient({ chainId });
  const send = useRegistryWriter();
  const fileRef = useRef(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]); // { line, data, errors, selected, status, certId, existingId, error }
  const [fileErrors, setFileErrors] = useState([]);
  const [batchSize, setBatchSize] = useState(10);
  const [running, setRunning] = useState(false);
  const [batches, setBatches] = useState([]); // { n, count, status, hash, error, ids }
  const [checking, setChecking] = useState(false);

  const selectedRows = useMemo(() => rows.filter((r) => r.selected && selectable(r)), [rows]);
  const validCount = rows.filter(selectable).length;

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setBatches([]);
    setFileErrors([]);
    setRows([]);
    try {
      const parsed = await parseCertificateFile(file);
      setFileErrors(parsed.fileErrors);
      let list = parsed.rows.map((r) => ({ ...r, selected: false, status: "idle" }));

      // Ask the contract which rows already exist, to avoid a whole batch reverting.
      setChecking(true);
      list = await Promise.all(
        list.map(async (r) => {
          if (r.errors.length) return r;
          try {
            const id = await publicClient.readContract({
              address,
              abi,
              functionName: "findCertificateId",
              args: [r.data.studentId, r.data.diplomaTitle],
            });
            return id > 0n ? { ...r, existingId: String(id) } : r;
          } catch {
            return r;
          }
        })
      );
      setChecking(false);
      setRows(list.map((r) => ({ ...r, selected: selectable(r) })));
    } catch (err) {
      setChecking(false);
      setFileErrors([`Could not read this file: ${err.message}`]);
    }
  }

  const toggle = (line) =>
    setRows((rs) => rs.map((r) => (r.line === line && selectable(r) ? { ...r, selected: !r.selected } : r)));
  const toggleAll = (on) => setRows((rs) => rs.map((r) => ({ ...r, selected: on && selectable(r) })));

  async function issue() {
    const size = clamp(Number(batchSize) || 10, 1, 50);
    const todo = selectedRows;
    const chunks = [];
    for (let i = 0; i < todo.length; i += size) chunks.push(todo.slice(i, i + size));

    setRunning(true);
    setBatches(chunks.map((c, i) => ({ n: i + 1, count: c.length, status: "pending" })));
    const patchBatch = (i, patch) =>
      setBatches((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const lines = new Set(chunk.map((r) => r.line));
      patchBatch(i, { status: "signing" });
      try {
        const { hash, ids } = await send(
          "batchMint",
          [
            chunk.map((r) => recipientOrZero(r.data)),
            chunk.map((r) => r.data.studentName),
            chunk.map((r) => r.data.studentId),
            chunk.map((r) => r.data.diplomaTitle),
            chunk.map((r) => r.data.issueDate),
            chunk.map((r) => r.data.grade),
          ],
          { onHash: (h) => patchBatch(i, { status: "confirming", hash: h }) }
        );
        patchBatch(i, { status: "done", hash, ids });
        // Events are emitted in row order, so ids[k] belongs to chunk[k].
        setRows((rs) =>
          rs.map((r) => {
            if (!lines.has(r.line)) return r;
            const k = chunk.findIndex((c) => c.line === r.line);
            return { ...r, status: "minted", certId: String(ids[k]), selected: false };
          })
        );
      } catch (err) {
        const msg = explainError(err);
        patchBatch(i, { status: "failed", error: msg });
        setRows((rs) => rs.map((r) => (lines.has(r.line) ? { ...r, status: "failed", error: msg } : r)));
        break; // stop here: fix the problem, then press the button again for the remaining rows
      }
    }
    setRunning(false);
  }

  const reset = () => {
    setRows([]);
    setFileName("");
    setFileErrors([]);
    setBatches([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="block">
      <h2>Import from Excel or CSV</h2>
      <p className="hint">
        First sheet, header row required: studentName, studentId, diplomaTitle, issueDate (YYYY-MM-DD), grade,
        recipientAddress (optional). Nothing is uploaded: the file is read in your browser.
      </p>

      <div className="actions">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={running} />
        {rows.length > 0 && (
          <button className="btn ghost" onClick={reset} disabled={running}>
            Clear
          </button>
        )}
      </div>

      {fileErrors.map((m) => (
        <div className="notice err" key={m}>
          {m}
        </div>
      ))}
      {checking && <p className="hint">Checking which certificates already exist on-chain…</p>}

      {rows.length > 0 && (
        <>
          <p className="summary">
            <strong>{fileName}</strong> · {rows.length} rows · {validCount} can be issued · {selectedRows.length}{" "}
            selected
          </p>
          <div className="actions">
            <button className="btn ghost" onClick={() => toggleAll(true)} disabled={running}>
              Select all valid
            </button>
            <button className="btn ghost" onClick={() => toggleAll(false)} disabled={running}>
              Select none
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Line</th>
                  <th>Student</th>
                  <th>ID</th>
                  <th>Diploma</th>
                  <th>Date</th>
                  <th>Grade</th>
                  <th>Wallet</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = statusOf(r);
                  return (
                    <tr key={r.line} className={st.cls === "err" ? "row-err" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select line ${r.line}`}
                          checked={r.selected}
                          disabled={!selectable(r) || running}
                          onChange={() => toggle(r.line)}
                        />
                      </td>
                      <td className="mono">{r.line}</td>
                      <td>{r.data.studentName}</td>
                      <td className="mono">{r.data.studentId}</td>
                      <td>{r.data.diplomaTitle}</td>
                      <td className="mono">{r.data.issueDate}</td>
                      <td>{r.data.grade}</td>
                      <td className="mono">{shortAddr(r.data.recipientAddress) || "—"}</td>
                      <td className={`st ${st.cls}`}>{st.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="actions">
            <label className="inline">
              Certificates per transaction
              <input
                type="number"
                min="1"
                max="50"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                disabled={running}
              />
            </label>
            <span className="hint">5 to 15 is recommended (gas limit).</span>
            <button className="btn" onClick={issue} disabled={running || selectedRows.length === 0}>
              {running
                ? "Issuing…"
                : `Issue ${selectedRows.length} certificate${selectedRows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}

      {batches.length > 0 && (
        <ol className="batches">
          {batches.map((b) => (
            <li key={b.n}>
              <div>
                Transaction {b.n}/{batches.length} · {b.count} certificates ·{" "}
                <span className={b.status === "failed" ? "st err" : b.status === "done" ? "st ok" : "st"}>
                  {{ pending: "Waiting", signing: "Confirm in your wallet", confirming: "Waiting for confirmation", done: "Confirmed", failed: "Failed" }[b.status]}
                </span>
              </div>
              {b.hash && b.status !== "done" && <div className="mono small">{shortHash(b.hash)}</div>}
              {b.status === "done" && <TxResult hash={b.hash} ids={b.ids} onVerify={onVerify} />}
              {b.error && <div className="notice err">{b.error}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
