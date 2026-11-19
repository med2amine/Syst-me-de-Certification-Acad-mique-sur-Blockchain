const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// The frontend reads its ABI + addresses from this file (updated on every deploy).
const OUT = path.join(__dirname, "..", "frontend", "src", "contracts", "CertificateRegistry.json");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const { chainId } = await hre.ethers.provider.getNetwork();
  console.log(`Deploying with ${deployer.address} on chain ${chainId}...`);

  const registry = await hre.ethers.deployContract("CertificateRegistry");
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log(`CertificateRegistry deployed at: ${address}`);

  const artifact = await hre.artifacts.readArtifact("CertificateRegistry");
  let current = { deployments: {} };
  if (fs.existsSync(OUT)) current = JSON.parse(fs.readFileSync(OUT, "utf8"));

  current.abi = artifact.abi;
  current.deployments = { ...(current.deployments || {}), [chainId.toString()]: address };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(current, null, 2));
  console.log(`Frontend config updated: ${path.relative(process.cwd(), OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
