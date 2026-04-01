"use client";

import z from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SAFETY_NET_ADDRESS: z.string().default("0x0000000000000000000000000000000000000000"),
  NEXT_PUBLIC_BREAD_TOKEN_ADDRESS: z.string().default("0x0000000000000000000000000000000000000000"),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().default(""),
  NEXT_PUBLIC_NODE_ENV: z
    .enum(["development", "production", "local"])
    .default("local"),
  NEXT_PUBLIC_PRIVY_APP_ID: z.string().default(""),
  NEXT_PUBLIC_PRIVY_CLIENT_ID: z.string().default(""),
});

const parsedSchema = envSchema.safeParse({
  NEXT_PUBLIC_SAFETY_NET_ADDRESS:
    process.env.NEXT_PUBLIC_SAFETY_NET_ADDRESS,
  NEXT_PUBLIC_BREAD_TOKEN_ADDRESS:
    process.env.NEXT_PUBLIC_BREAD_TOKEN_ADDRESS,
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  NEXT_PUBLIC_NODE_ENV: process.env.NEXT_PUBLIC_NODE_ENV,
  NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  NEXT_PUBLIC_PRIVY_CLIENT_ID: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID,
});

if (!parsedSchema.success) {
  const errMsg = "___ Provide all CLIENT env variables ___";
  console.log(errMsg);
  console.log(parsedSchema.error.issues);
  throw new Error(errMsg);
}

export const clientEnv = parsedSchema.data;
