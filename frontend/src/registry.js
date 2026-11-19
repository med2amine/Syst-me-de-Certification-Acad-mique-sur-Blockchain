import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { parseEventLogs } from "viem";
import { config } from "./wagmi";
import deployment from "./contracts/CertificateRegistry.json";

export const abi = deployment.abi;

export const EXPLORERS = { 11155111: "https://sepolia.etherscan.io" };

/** Which chain / contract the app is currently talking to. */
export function useRegistry() {
  const { chainId: walletChainId, isConnected } = useAccount();
  const selectedChainId = useChainId();
  const chainId = isConnected && walletChainId ? walletChainId : selectedChainId;
  const supported = config.chains.some((c) => c.id === chainId);
  const address = supported ? deployment.deployments?.[String(chainId)] : undefined;
  return { chainId, supported, address, abi };
}

/**
 * Returns send(functionName, args, { onHash }).
 * 1) simulates the call (free, gives readable revert reasons),
 * 2) asks the wallet to sign,
 * 3) waits for the receipt and returns the minted certificate ids.
 */
export function useRegistryWriter() {
  const { address: contract, chainId } = useRegistry();
  const { address: account } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();

  return async function send(functionName, args, { onHash } = {}) {
    const base = { address: contract, abi, functionName, args };
    await publicClient.simulateContract({ ...base, account });
    const hash = await writeContractAsync({ ...base, chainId });
    onHash?.(hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction was reverted on-chain.");
    const ids = parseEventLogs({ abi, eventName: "CertificateMinted", logs: receipt.logs }).map(
      (l) => l.args.certId
    );
    return { hash, ids };
  };
}
