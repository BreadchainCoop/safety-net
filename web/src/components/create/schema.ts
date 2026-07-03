import { isAddress } from "viem";
import { z } from "zod";
import { REDEEM_RATIO } from "@/lib/config";

/** Positive decimal token amount as a string (parsed with token decimals). */
const amountString = z
  .string()
  .trim()
  .refine(
    (v) => v.length > 0 && !Number.isNaN(Number(v)) && Number(v) > 0,
    "Enter an amount greater than 0",
  );

export const createNetSchema = z
  .object({
    // Group size cap (contract maximumMembers). The owner is the sole member
    // at creation — everyone else joins via invite links before start().
    memberCount: z
      .number({ error: "Enter a whole number" })
      .int("Whole numbers only")
      .min(2, "At least 2 members are required"),
    tokenChoice: z.enum(["bread", "custom"]),
    customToken: z.string().trim(),
    initialDeposit: amountString,
    fixedDeposit: amountString,
    // Locked onchain in v1 (MINIMUM/MAXIMUM_REDEEM_RATIO are both 1):
    // deposits and withdrawal power are 1:1, leverage disabled.
    redeemRatio: z.literal(REDEEM_RATIO),
    autoThreshold: amountString,
    contestThreshold: z
      .number({ error: "Enter a percentage" })
      .int("Whole numbers only")
      .min(1, "At least 1%")
      .max(100, "At most 100%"),
    contestWindowDays: z
      .number({ error: "Enter a number of days" })
      .positive("Must be positive")
      .max(365, "At most a year"),
    epochDurationDays: z
      .number({ error: "Enter a number of days" })
      .positive("Must be positive")
      .max(366, "At most a year"),
    smallWithdrawsLimit: z
      .number({ error: "Enter a whole number" })
      .int("Whole numbers only")
      .min(1, "At least 1"),
    minimumMembers: z
      .number({ error: "Enter a whole number" })
      .int("Whole numbers only")
      .min(2, "The contract requires at least 2"),
  })
  .check((ctx) => {
    const v = ctx.value;
    if (v.memberCount < v.minimumMembers) {
      ctx.issues.push({
        code: "custom",
        message: "Must be ≥ minimum members",
        path: ["memberCount"],
        input: v.memberCount,
      });
    }
    if (v.tokenChoice === "custom" && !isAddress(v.customToken)) {
      ctx.issues.push({
        code: "custom",
        message: "Enter a valid token address",
        path: ["customToken"],
        input: v.customToken,
      });
    }
  });

export type CreateNetValues = z.infer<typeof createNetSchema>;
