import { isAddress } from "viem";
import { z } from "zod";
import { MAX_REDEEM_RATIO, MIN_REDEEM_RATIO } from "@/lib/config";

/** Positive decimal token amount as a string (parsed with token decimals). */
const amountString = z
  .string()
  .trim()
  .refine(
    (v) => v.length > 0 && !Number.isNaN(Number(v)) && Number(v) > 0,
    "Enter an amount greater than 0",
  );

/**
 * Optional positive amount: empty is allowed (the form derives a sensible
 * Broodfonds default from the recurring deposit), but if the user does enter a
 * value in Advanced mode it must be a positive number.
 */
const optionalAmountString = z
  .string()
  .trim()
  .refine(
    (v) => v.length === 0 || (!Number.isNaN(Number(v)) && Number(v) > 0),
    "Enter an amount greater than 0",
  );

/** UTF-8 byte length — must match the contract's MAX_NAME_BYTES check. */
const utf8Bytes = (v: string) => new TextEncoder().encode(v).length;

export const createNetSchema = z
  .object({
    // Optional human-readable name (contract MAX_NAME_BYTES = 128). Empty is
    // allowed on-chain; we cap the byte length to match the NameTooLong revert.
    name: z
      .string()
      .trim()
      .refine((v) => utf8Bytes(v) <= 128, "Name is too long (max 128 bytes)"),
    // Group size cap (contract maximumMembers). The owner is the sole member
    // at creation — everyone else joins via invite links before start().
    memberCount: z
      .number({ error: "Enter a whole number" })
      .int("Whole numbers only")
      .min(2, "At least 2 members are required"),
    tokenChoice: z.enum(["bread", "custom"]),
    customToken: z.string().trim(),
    // The only amount a member picks in Simple mode: the recurring (monthly)
    // contribution. Everything else derives from it by default.
    fixedDeposit: amountString,
    // Derived by default (= one recurring deposit): the one-off join payment.
    // Only edited in Advanced mode, so it's optional here.
    initialDeposit: optionalAmountString,
    // Support ratio, mirroring the contract's MINIMUM/MAXIMUM_REDEEM_RATIO
    // (1-25). x1 = pure savings circle; ~x22 = classic Broodfonds solidarity.
    redeemRatio: z
      .number({ error: "Enter a whole number" })
      .int("Whole numbers only")
      .min(MIN_REDEEM_RATIO, `At least ×${MIN_REDEEM_RATIO}`)
      .max(MAX_REDEEM_RATIO, `At most ×${MAX_REDEEM_RATIO}`),
    // Derived by default (= a quarter of the recurring deposit). Advanced-only.
    autoThreshold: optionalAmountString,
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
