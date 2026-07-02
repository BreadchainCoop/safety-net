import { isAddress } from "viem";
import { z } from "zod";
import { MAX_REDEEM_RATIO, MIN_REDEEM_RATIO } from "@/lib/config";

const addressString = z
  .string()
  .trim()
  // `: boolean` prevents TS from inferring a type predicate (which would
  // split the schema's input/output types and break the RHF resolver).
  .refine((v): boolean => isAddress(v), "Not a valid address");

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
    members: z
      .array(addressString)
      .min(1, "Add at least one member (you can invite more later)"),
    tokenChoice: z.enum(["wxdai", "bread", "custom"]),
    customToken: z.string().trim(),
    initialDeposit: amountString,
    fixedDeposit: amountString,
    redeemRatio: z
      .number({ error: "Enter a whole number" })
      .int("Whole numbers only")
      .min(MIN_REDEEM_RATIO, `At least ${MIN_REDEEM_RATIO}`)
      .max(MAX_REDEEM_RATIO, `At most ${MAX_REDEEM_RATIO}`),
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
    startTime: z.string().min(1, "Pick a start time"),
    minimumMembers: z
      .number({ error: "Enter a whole number" })
      .int("Whole numbers only")
      .min(2, "The contract requires at least 2"),
    maximumMembers: z
      .number({ error: "Enter a whole number" })
      .int("Whole numbers only")
      .min(2, "At least 2"),
  })
  .check((ctx) => {
    const v = ctx.value;
    if (v.maximumMembers < v.minimumMembers) {
      ctx.issues.push({
        code: "custom",
        message: "Must be ≥ minimum members",
        path: ["maximumMembers"],
        input: v.maximumMembers,
      });
    }
    if (v.members.length > v.maximumMembers) {
      ctx.issues.push({
        code: "custom",
        message: `You've added ${v.members.length} members but capped the group at ${v.maximumMembers}`,
        path: ["maximumMembers"],
        input: v.maximumMembers,
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
    if (Number.isNaN(Date.parse(v.startTime))) {
      ctx.issues.push({
        code: "custom",
        message: "Not a valid date",
        path: ["startTime"],
        input: v.startTime,
      });
    }
  });

export type CreateNetValues = z.infer<typeof createNetSchema>;
