import { BaseError, ContractFunctionRevertedError } from "viem";

const MESSAGES = {
  NotAdmin: () => "This wallet is not authorized to issue or revoke certificates.",
  NotOwner: () => "Only the contract owner can do this.",
  EmptyField: (a) => `The field "${a[0]}" is required.`,
  DuplicateCertificate: (a) => `This student already holds this diploma (certificate #${a[0]}).`,
  CertificateNotFound: (a) => `No certificate with number ${a[0]}.`,
  AlreadyRevoked: (a) => `Certificate #${a[0]} is already revoked.`,
  ArrayLengthMismatch: () => "The batch arrays do not have the same length.",
  EmptyBatch: () => "The batch is empty.",
  BatchTooLarge: (a) => `Batch of ${a[0]} is too large (max ${a[1]} per transaction).`,
  ZeroAddress: () => "The zero address is not allowed here.",
};

/** Turns any wagmi/viem error into a short sentence a human can act on. */
export function explainError(e) {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      const args = revert.data?.args ?? [];
      if (name && MESSAGES[name]) return MESSAGES[name](args);
      return revert.reason || revert.shortMessage;
    }
    if (e.walk((x) => x?.name === "UserRejectedRequestError")) {
      return "You rejected the request in your wallet.";
    }
    return e.shortMessage || e.message;
  }
  return e?.message ?? String(e);
}
