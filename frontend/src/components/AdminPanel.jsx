import { useAccount, useReadContract } from "wagmi";
import { useRegistry } from "../registry";
import SingleMintForm from "./SingleMintForm";
import ExcelImport from "./ExcelImport";

export default function AdminPanel({ onVerify }) {
  const { address: account, isConnected } = useAccount();
  const { chainId, address, abi, supported } = useRegistry();

  const { data: isAdmin, isLoading } = useReadContract({
    address,
    abi,
    functionName: "isAdmin",
    args: account ? [account] : undefined,
    chainId,
    query: { enabled: Boolean(address && account) },
  });

  return (
    <section className="panel">
      <h1>Issue certificates</h1>
      <p className="lead">Reserved to the university's authorized wallets. Every certificate is a blockchain transaction.</p>

      {!isConnected && <div className="notice warn">Connect your wallet (top right) to continue.</div>}
      {isConnected && !supported && (
        <div className="notice warn">Your wallet is on an unsupported network. Switch to Local or Sepolia.</div>
      )}
      {isConnected && supported && !address && (
        <div className="notice warn">No contract is deployed on this network yet (see README, "Deploy").</div>
      )}
      {isConnected && address && !isLoading && isAdmin === false && (
        <div className="notice err">
          This wallet is not authorized. Ask the contract owner to call <code>setAdmin</code> for your address.
        </div>
      )}

      {isConnected && address && isAdmin && (
        <>
          <SingleMintForm onVerify={onVerify} />
          <ExcelImport onVerify={onVerify} />
        </>
      )}
    </section>
  );
}
