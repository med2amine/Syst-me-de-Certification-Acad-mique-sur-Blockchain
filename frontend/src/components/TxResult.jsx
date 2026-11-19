import { EXPLORERS, useRegistry } from "../registry";

/** Shows a transaction hash (with explorer link on Sepolia) and the certificate ids minted. */
export default function TxResult({ hash, ids = [], onVerify }) {
  const { chainId } = useRegistry();
  const explorer = EXPLORERS[chainId];
  return (
    <div className="notice ok" role="status">
      <div>
        Transaction confirmed
        {ids.length > 0 && (
          <>
            {" "}
            · certificate{ids.length > 1 ? "s" : ""}{" "}
            {ids.map((id, i) => (
              <span key={String(id)}>
                {i > 0 && ", "}
                <button className="link" onClick={() => onVerify?.(id)}>
                  #{String(id)}
                </button>
              </span>
            ))}
          </>
        )}
      </div>
      <div className="mono small break">
        {explorer ? (
          <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
            {hash}
          </a>
        ) : (
          hash
        )}
      </div>
    </div>
  );
}
