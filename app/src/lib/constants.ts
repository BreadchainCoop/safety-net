import { Address } from "viem";
import { clientEnv } from "./env";

export const SAFETY_NET_ADDRESS =
  clientEnv.NEXT_PUBLIC_SAFETY_NET_ADDRESS as Address;

export const BREAD_TOKEN_ADDRESS =
  clientEnv.NEXT_PUBLIC_BREAD_TOKEN_ADDRESS as Address;
