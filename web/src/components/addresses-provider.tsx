"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ADDRESSES } from "@/lib/config";
import { hydrateRemoteAddresses } from "@/lib/remote-addresses";

/**
 * Re-render signal for runtime address hydration. The context value is a
 * version counter that bumps once when the manifest fetch lands with new
 * addresses; `useAddresses()` subscribes and returns the (in-place mutated)
 * ADDRESSES object. Wagmi query keys include the contract address, so the
 * re-render alone makes every read refetch against the fresh deployment —
 * no manual cache invalidation needed.
 */
const AddressesVersionContext = createContext(0);

export function AddressesProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void hydrateRemoteAddresses().then((updated) => {
      if (updated && !cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AddressesVersionContext.Provider value={version}>
      {children}
    </AddressesVersionContext.Provider>
  );
}

/**
 * Read the live contract addresses inside a component, subscribed to runtime
 * hydration. Use this for anything render-time (wagmi read configs); event
 * handlers can read `ADDRESSES` from config directly (call-time is always
 * fresh).
 */
export function useAddresses(): typeof ADDRESSES {
  useContext(AddressesVersionContext);
  return ADDRESSES;
}
