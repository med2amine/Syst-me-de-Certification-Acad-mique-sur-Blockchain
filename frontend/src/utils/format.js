export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-8)}` : "");
