import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { config } from "./wagmi";
import { useRegistry } from "./registry";
import { shortAddr } from "./utils/format";
import PublicPanel from "./components/PublicPanel";
import AdminPanel from "./components/AdminPanel";

function NetworkSwitch() {
  const { chainId } = useRegistry();
  const { switchChain } = useSwitchChain();
  return (
    <div className="segmented" role="group" aria-label="Network">
      {config.chains.map((c) => (
        <button
          key={c.id}
          className={c.id === chainId ? "on" : ""}
          aria-pressed={c.id === chainId}
          onClick={() => switchChain({ chainId: c.id })}
        >
          {c.id === 31337 ? "Local" : c.name}
        </button>
      ))}
    </div>
  );
}

function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <button className="btn ghost mono" onClick={() => disconnect()} title="Disconnect">
        {shortAddr(address)}
      </button>
    );
  }
  return (
    <div className="wallet">
      <button className="btn" disabled={isPending} onClick={() => connect({ connector: connectors[0] })}>
        {isPending ? "Waiting for wallet" : "Connect wallet"}
      </button>
      {error && <span className="hint err">{error.shortMessage || error.message}</span>}
    </div>
  );
}

export default function App() {
  const initialCert = new URLSearchParams(window.location.search).get("cert") || "";
  const [tab, setTab] = useState("verify");
  const [certId, setCertId] = useState(initialCert);

  const goVerify = (id) => {
    setCertId(String(id));
    setTab("verify");
    window.history.replaceState(null, "", `?cert=${id}`);
  };

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Diploma Registry</span>
          </div>
          <nav className="tabs" aria-label="Sections">
            <button className={tab === "verify" ? "on" : ""} onClick={() => setTab("verify")}>
              Verify a certificate
            </button>
            <button className={tab === "admin" ? "on" : ""} onClick={() => setTab("admin")}>
              Issue certificates
            </button>
          </nav>
          <div className="tools">
            <NetworkSwitch />
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="wrap">
        {tab === "verify" ? (
          <PublicPanel initialId={certId} />
        ) : (
          <AdminPanel onVerify={goVerify} />
        )}
      </main>
    </>
  );
}
