import { createConfig, http } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// hardhat = local node (chain id 31337), sepolia = public testnet (11155111).
// The first chain is the default when no wallet is connected.
export const config = createConfig({
  chains: [hardhat, sepolia],
  connectors: [injected()], // MetaMask & other browser wallets
  transports: {
    [hardhat.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL || undefined),
  },
});
