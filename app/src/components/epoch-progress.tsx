"use client";

import { useState, useEffect } from "react";
import { Body, Caption } from "@breadcoop/ui";
import { Countdown } from "./countdown";

interface EpochProgressProps {
  epochStart: bigint;
  epochDuration: bigint;
  epochIndex: bigint;
}

export function EpochProgress({ epochStart, epochDuration, epochIndex }: EpochProgressProps) {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(BigInt(Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const currentEpochStart = epochStart + epochIndex * epochDuration;
  const currentEpochEnd = currentEpochStart + epochDuration;

  const elapsed = now > currentEpochStart ? Number(now - currentEpochStart) : 0;
  const total = Number(epochDuration);
  const percentage = Math.min(100, (elapsed / total) * 100);

  return (
    <div className="card-shadow-bg rounded-xl p-6">
      <div className="flex items-center justify-between mb-3">
        <Caption>Epoch {epochIndex.toString()} Progress</Caption>
        <Countdown targetTimestamp={currentEpochEnd} />
      </div>
      <div className="w-full bg-paper-1 rounded-full h-2.5">
        <div
          className="bg-primary-orange h-2.5 rounded-full transition-all duration-1000"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <Body className="text-xs text-gray-400">
          {Math.round(percentage)}%
        </Body>
      </div>
    </div>
  );
}
