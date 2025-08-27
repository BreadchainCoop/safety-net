# Breadfund Fuzz Testing Overview

This fuzz suite stress-tests the lifecycle of `Breadfund.sol` with randomized inputs and adversarial sequences of deposits, withdrawals, voting, and decommissions.

The goal is not just to validate correctness under expected flows, but to explore **edge cases** and surface **unexpected behaviors**. 
---

## Layout

```
test/fuzz/
   BreadfundFuzzBase.t.sol                 # shared setup + helpers
   BreadfundFuzz_Bugs.t.sol                # known bug spotlight tests
   BreadfundFuzz_Create.t.sol              # fuzzing creation edge cases
   BreadfundFuzz_DepositWithdraw.t.sol     # deposits, small/large withdraws
   BreadfundFuzz_RequestsVoting.t.sol      # requests, voting, contest windows
   BreadfundFuzz_Decommission.t.sol        # missed payments & fund wind-down
   BreadfundFuzz_Soak_VariableMembers.t.sol# scale tests with many members/epochs
```

* **`BreadfundFuzzBase.t.sol`**
  Abstract contract holding common setup (proxy deployment, mock token, safe defaults) and helpers (mint+approve, `_depositAs`, conservation invariants, epoch/time manipulation).

* **`BreadfundFuzz_Bugs.t.sol`**
  “Living documentation” of current **problematic behaviors** found. These tests *pass today* because they assert the actual (buggy) behavior. Once fixes are merged, expectations should be flipped.

* **`BreadfundFuzz_Create.t.sol`**
  Fuzzes the `create()` flow with randomized member arrays, consensus thresholds, and tokens. Ensures only successful creations advance the global counter.

* **`BreadfundFuzz_DepositWithdraw.t.sol`**
  Focused on `_deposit` and `_withdraw`:

  * Only one deposit per member per epoch.
  * Small withdrawals respect the per-epoch limit.
  * Large withdrawals generate requests and can auto-execute.
  * Global invariant: vault balance must (conservatively) cover all withdrawables.

* **`BreadfundFuzz_RequestsVoting.t.sol`**
  Tests around governance:

  * Voting threshold is strict “greater than,” not “greater or equal.”
  * Contest blocks auto-execution.
  * Double-votes and out-of-window votes revert.
  * Randomized voting order with bias.

* **`BreadfundFuzz_Decommission.t.sol`**
  Simulates skipped payments and validates decommission logic:

  * Any missed deposit in a past epoch makes the fund decommissionable.
  * On decommission, withdrawables are paid, and leftover balance is split equally (dust remains stranded).

* **`BreadfundFuzz_Soak_VariableMembers.t.sol`**
  Large-scale stress tests:

  * Random operations across many epochs.
  * Variable member counts (up to \~25).
  * Ensures no catastrophic state corruption under prolonged activity.

---

## Findings (Bug Spotlights)

1. **Duplicate members allowed at creation**

   * `create()` accepts duplicate addresses in the member array.
   * This inflates `members.length` and breaks accounting (e.g., vote thresholds, memberBreadfunds list).

2. **Large withdrawals do not decrement withdrawables**

   * When a large withdrawal auto-executes, tokens leave the vault but the member’s withdrawable balance is unchanged.
   * Invariants are relaxed in fuzz to account for this, but it represents an economic bug.

3. **Anyone can create and drain a request (critical)**

   * `createRequest` does not enforce membership.
   * Any address can craft a request and later drain funds after contest window.

4. **Deposits accept any positive amount**

   * Contract enforces only “> 0”.
   * If the product intends exact dues per epoch, this is a **policy bug**.

5. **First deposit permanently sets daily cap**

   * Daily/monthly withdraw cap uses `breadfundMemberContribute`, which is only set on the **first deposit**.
   * Larger later deposits do not increase the cap, trapping liquidity unless via large-request flow.

6. **Overpayments credited but cap unchanged**

   * Extra deposits increase withdrawable balances, but daily cap remains fixed from first deposit.

7. **Decommission can revert after large exec**

   * Because withdrawables are not decremented on large withdrawals, decommission tries to pay phantom balances that exceed the vault. This can hard-revert fund wind-down.

8. **Ratio > 1 breaks conservation**

   * With `ratio > 1`, withdrawables can exceed actual tokens in the contract.
   * This is surfaced explicitly in fuzz tests.


