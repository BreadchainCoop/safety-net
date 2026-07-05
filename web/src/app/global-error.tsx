"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown in the root layout itself (before the
 * route error.tsx can catch them). Must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#f6f3eb",
          color: "#1a1a1a",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "24rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.75rem", color: "#5c5850" }}>
            The app hit an unexpected error. Reload to continue — your funds are
            safe on-chain.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              background: "#286b63",
              color: "white",
              border: "none",
              borderRadius: "0.75rem",
              padding: "0.5rem 1rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
