import { useState } from "react";
import { useRegistryWriter } from "../registry";
import { explainError } from "../utils/errors";
import { recipientOrZero, validateRecord } from "../utils/validation";
import TxResult from "./TxResult";

const EMPTY = {
  studentName: "",
  studentId: "",
  diplomaTitle: "",
  issueDate: new Date().toISOString().slice(0, 10),
  grade: "",
  recipientAddress: "",
};

export default function SingleMintForm({ onVerify }) {
  const send = useRegistryWriter();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(null); // null | "signing" | "confirming"
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setResult(null);
    const problems = validateRecord(form);
    if (problems.length) return setError(problems.join(" · "));
    setError(null);
    setBusy("signing");
    try {
      const res = await send(
        "mintCertificate",
        [
          recipientOrZero(form),
          form.studentName.trim(),
          form.studentId.trim(),
          form.diplomaTitle.trim(),
          form.issueDate,
          form.grade.trim(),
        ],
        { onHash: () => setBusy("confirming") }
      );
      setResult(res);
      setForm({ ...EMPTY, diplomaTitle: form.diplomaTitle, issueDate: form.issueDate });
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="block">
      <h2>Issue one certificate</h2>
      <form className="grid" onSubmit={submit}>
        <label>
          Student name
          <input value={form.studentName} onChange={set("studentName")} placeholder="Amina Benali" />
        </label>
        <label>
          Student ID (CNE)
          <input value={form.studentId} onChange={set("studentId")} placeholder="2023-INF-042" />
        </label>
        <label className="span2">
          Diploma title
          <input value={form.diplomaTitle} onChange={set("diplomaTitle")} placeholder="Licence Informatique" />
        </label>
        <label>
          Issue date
          <input type="date" value={form.issueDate} onChange={set("issueDate")} />
        </label>
        <label>
          Grade
          <input value={form.grade} onChange={set("grade")} placeholder="Mention Bien" />
        </label>
        <label className="span2">
          Recipient wallet <span className="hint">(optional)</span>
          <input
            className="mono"
            value={form.recipientAddress}
            onChange={set("recipientAddress")}
            placeholder="0x…"
          />
        </label>
        <div className="span2 actions">
          <button className="btn" type="submit" disabled={Boolean(busy)}>
            {busy === "signing" ? "Confirm in your wallet" : busy === "confirming" ? "Waiting for confirmation" : "Issue certificate"}
          </button>
        </div>
      </form>
      {error && <div className="notice err">{error}</div>}
      {result && <TxResult hash={result.hash} ids={result.ids} onVerify={onVerify} />}
    </div>
  );
}
