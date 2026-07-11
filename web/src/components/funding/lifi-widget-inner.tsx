"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import type { Address } from "viem";
import {
  ChainType,
  LiFiWidget,
  useWidgetEvents,
  WidgetEvent,
  WidgetSkeleton,
  type Route,
  type RouteExecutionUpdate,
  type WidgetConfig,
} from "@lifi/widget";
import { lifiConfig } from "./lifi-config";
import { CHAIN_ID } from "@/lib/config";

/**
 * The actual LiFi widget. This module imports `@lifi/widget`'s runtime, so it
 * MUST only ever be reached through `next/dynamic(..., { ssr: false })` (see
 * lifi-bridge.tsx) — it never executes during static generation.
 *
 * app-stacks isolates the widget the same way (bridge.tsx + wrapper.tsx). We
 * additionally gate the render behind a client-hydration check so the widget's
 * DOM only mounts after hydration.
 */

function subscribe() {
  return () => {};
}

/** True only after client hydration (false during SSR / first render). */
function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export default function LiFiWidgetInner({
  address,
  onXdaiRouted,
}: {
  address: Address;
  onXdaiRouted?: (route: Route) => void;
}) {
  // Per LiFi docs, subscribe to widget events OUTSIDE the widget component to
  // avoid re-render glitches.
  const widgetEvents = useWidgetEvents();

  useEffect(() => {
    const onCompleted = (route: Route) => {
      if (route.toAddress && route.toAddress !== address) return;
      if (route.toToken.chainId !== CHAIN_ID) return;
      // xDAI landed on Gnosis — hand off to the auto-mint offer.
      onXdaiRouted?.(route);
    };
    const onFailed = (update: RouteExecutionUpdate) => {
      console.warn("[lifi] route execution failed", update.action?.status);
    };

    widgetEvents.on(WidgetEvent.RouteExecutionCompleted, onCompleted);
    widgetEvents.on(WidgetEvent.RouteExecutionFailed, onFailed);
    return () => {
      widgetEvents.off(WidgetEvent.RouteExecutionCompleted, onCompleted);
      widgetEvents.off(WidgetEvent.RouteExecutionFailed, onFailed);
    };
  }, [widgetEvents, address, onXdaiRouted]);

  const config: Partial<WidgetConfig> = {
    ...lifiConfig,
    toAddress: {
      address,
      chainType: ChainType.EVM,
      name: "Your Safety Net wallet",
    },
  };

  const hydrated = useHydrated();
  if (!hydrated) return <WidgetSkeleton config={config} />;

  return <LiFiWidget config={config} integrator="SafetyNet" />;
}
