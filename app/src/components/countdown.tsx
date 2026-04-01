"use client";

import { useState, useEffect } from "react";
import { Body } from "@breadcoop/ui";

interface CountdownProps {
  targetTimestamp: bigint;
  label?: string;
  onExpire?: () => void;
}

export function Countdown({ targetTimestamp, label, onExpire }: CountdownProps) {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));

  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(false);
  }, [targetTimestamp]);

  useEffect(() => {
    const interval = setInterval(() => {
      const current = BigInt(Math.floor(Date.now() / 1000));
      setNow(current);
      if (!expired && current >= targetTimestamp) {
        setExpired(true);
        onExpire?.();
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [targetTimestamp, onExpire, expired]);

  if (targetTimestamp <= now) {
    return (
      <Body className="text-red-500">
        {label && <span className="text-gray-500">{label}: </span>}
        Expired
      </Body>
    );
  }

  const remaining = Number(targetTimestamp - now);
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  let display: string;
  if (days > 0) {
    display = `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    display = `${hours}h ${minutes}m ${seconds}s`;
  } else {
    display = `${minutes}m ${seconds}s`;
  }

  return (
    <Body>
      {label && <span className="text-gray-500">{label}: </span>}
      {display}
    </Body>
  );
}
