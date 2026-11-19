import { useState } from "react";
import { useReadContract } from "wagmi";
import { useRegistry } from "../registry";
import { explainError } from "../utils/errors";

function Field({ label, children, mono }) {
  return (
    <div className="field-row">
      <dt>{label}</dt>
      <dd className={mono ? "mono break" : ""}>{children}</dd>
    </div>
  );
}

export default function PublicPanel({ initialId = "" }) {
  const { chainId, address, abi, supported } = useRegistry();
  const [input, setInput] = useState(initialId);
  const [searched, setSearched] = useState(/^\d+$/.test(initialId) ? initialId : "");

  const enabled = Boolean(address) && searched !== "";
  const { data: cert, error, isFetching } = useReadContract({
    address,
    abi,
    functionName: "getCertificate",
    args: enabled ? [BigInt(searched)] : undefined,
    chainId,
    query: { enabled, retry: false },
  });

  const { data: total } = useReadContract({
    address,
    abi,
    functionName: "totalCertificates",
    chainId,
    query: { enabled: Boolean(address) },
  });

  const submit = (e) => {
    e.preventDefault();
    const v = input.trim().replace(/^#/, "");
    if (/^\d+$/.test(v)) {
      setSearched(v);
      window.history.replaceState(null, "", `?cert=${v}`);
    }
  };

  return (
    <section className="panel">
      <h1>Verify a certificate</h1>
      <p className="lead">
        Enter the certificate number printed on the diploma. The answer is read directly from the blockchain, no
        account needed.
      </p>

      {!supported && <div className="notice warn">This network is not supported. Pick Local or Sepolia above.</div>}
      {supported && !address && (
        <div className="notice warn">
          No contract is deployed on this network yet. Run the deploy script (see README) and reload.
        </div>
      )}

      <form className="search" onSubmit={submit}>
        <label htmlFor="certId">Certificate number</label>
        <div className="search-row">
          <input
            id="certId"
            inputMode="numeric"
            placeholder="e.g. 1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn" type="submit" disabled={!address || !/^#?\d+$/.test(input.trim())}>
            Verify
          </button>
        </div>
        {total !== undefined && <span className="hint">{String(total)} certificates issued on this network</span>}
      </form>

      {isFetching && <p className="hint">Reading the blockchain…</p>}
      {error && !isFetching && <div className="notice err">{explainError(error)}</div>}

      {cert && !error && (
        <article className={`certificate ${cert.revoked ? "revoked" : "valid"}`} aria-live="polite">
          <header className="cert-head">
            <span className="cert-no mono">Certificate #{searched}</span>
            <span className={`seal ${cert.revoked ? "bad" : "good"}`}>{cert.revoked ? "Revoked" : "Valid"}</span>
          </header>
          <p className="cert-awarded">This certifies that</p>
          <h2 className="cert-name">{cert.studentName}</h2>
          <p className="cert-awarded">has been awarded</p>
          <h3 className="cert-diploma">{cert.diplomaTitle}</h3>
          <dl className="fields">
            <Field label="Date of issue">{cert.issueDate}</Field>
            <Field label="Grade">{cert.grade || "Not specified"}</Field>
            <Field label="Student ID" mono>
              {cert.studentId}
            </Field>
            <Field label="Recipient wallet" mono>
              {/^0x0{40}$/.test(cert.recipient) ? "None (no wallet provided)" : cert.recipient}
            </Field>
            <Field label="Registry contract" mono>
              {address}
            </Field>
          </dl>
        </article>
      )}
    </section>
  );
}
