// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * BreadfundFuzz_Decommission.t.sol
 *
 * Purpose: Exercise the "decommission" flow under harsh conditions:
 * - Members deposit unevenly
 * - One member skips contributions for several epochs
 * - Fund becomes decommissionable due to missed payments
 *
 * Properties checked:
 *  - Contract is flagged decommissionable after a skipped epoch.
 *  - Decommission distributes withdrawables + pro-rata share of remaining balance.
 *  - Withdrawable balances are reset to 0 after decommission.
 *  - The fund cannot be queried anymore (`NotCommissioned`).
 *  - Dust remainder stays in the contract (explicit policy).
 *
 * Notes for reviewers:
 *  - After fixing related accounting bugs (e.g., large-exec not decrementing
 *    withdrawables), re-check that `assertGe(cBalBefore, sumW)` still holds.
 *  - Could be extended with cases: prior pending requests, more members,
 *    fee-on-transfer tokens.
 * ────────────────────────────────────────────────────────────────────────────────
 */

import {BreadfundFuzzBase} from "./BreadfundFuzzBase.t.sol";
import {IBreadfund} from "src/interfaces/IBreadfund.sol";

contract BreadfundFuzz_Decommission is BreadfundFuzzBase {
  /// -------------------------------------------------------------------------
  /// Scenario: "Crazy decommissions" with uneven deposits and skipped epochs.
  /// Steps:
  ///  - 3 members deposit different amounts.
  ///  - In the next epoch, 1 member skips their deposit.
  ///  - After further skipped epochs, the fund is decommissionable.
  ///  - Verify distribution matches (withdrawables + equal split of remaining).
  /// Properties:
  ///  - Decommission zeroes out withdrawables.
  ///  - Payouts reflect prior withdrawables plus fair split of residual.
  ///  - Dust remainder stays inside the contract.
  /// -------------------------------------------------------------------------
  function testFuzz_CrazyDecommissions_DistributeOnMissedPayments(
    uint256 dep1Raw, uint256 dep2Raw, uint256 dep3Raw, uint8 skipEpochsRaw
  ) public {
    uint256 dep1 = bound(dep1Raw, 1e17, 5e19);
    uint256 dep2 = bound(dep2Raw, 1e17, 5e19);
    uint256 dep3 = bound(dep3Raw, 1e17, 5e19);
    uint256 skipEpochs = bound(uint256(skipEpochsRaw), 1, 4);

    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.breadfundStart = block.timestamp; 
    cfg.members = defaultMembers; 
    cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    // Pre-fund with enough allowance for multiple deposits.
    _mintApprove(member1, dep1 + dep1 + 2 * (cfg.initialDeposit + cfg.fixedDeposit), address(breadfund));
    _mintApprove(member2, dep2 + dep2 + 2 * (cfg.initialDeposit + cfg.fixedDeposit), address(breadfund));
    _mintApprove(member3, dep3 + dep3 + 2 * (cfg.initialDeposit + cfg.fixedDeposit), address(breadfund));

    // Initial deposits
    _depositAs(member1, id, dep1);
    _depositAs(member2, id, dep2);
    _depositAs(member3, id, dep3);

    // Next epoch: member3 skips their payment
    vm.warp(block.timestamp + cfg.epochDuration + 1);
    _depositAs(member1, id, dep1);
    _depositAs(member2, id, dep2);
    // member3 intentionally skips

    // Advance further epochs → fund should now be decommissionable
    vm.warp(block.timestamp + cfg.epochDuration * skipEpochs + 1);
    assertTrue(breadfund.isDecommissionable(id), "decommissionable after a missed epoch");

    // Snapshot before decommission
    uint256 cBalBefore = token.balanceOf(address(breadfund));
    uint256 w1 = breadfund.memberWithdrawableBalance(id, member1);
    uint256 w2 = breadfund.memberWithdrawableBalance(id, member2);
    uint256 w3 = breadfund.memberWithdrawableBalance(id, member3);
    uint256 sumW = w1 + w2 + w3;

    assertGe(cBalBefore, sumW, "contract covers withdrawables here");

    // Split of remainder among 3 members (equal share)
    uint256 remaining = cBalBefore - sumW;
    uint256 split = remaining / 3;
    uint256 remainder = remaining % 3;

    uint256 m1Before = token.balanceOf(member1);
    uint256 m2Before = token.balanceOf(member2);
    uint256 m3Before = token.balanceOf(member3);

    // Execute decommission
    breadfund.decommission(id);

    // Fund should be marked as not commissioned anymore
    vm.expectRevert(IBreadfund.NotCommissioned.selector);
    breadfund.getBreadfund(id);

    // All withdrawables zeroed out
    assertEq(breadfund.memberWithdrawableBalance(id, member1), 0);
    assertEq(breadfund.memberWithdrawableBalance(id, member2), 0);
    assertEq(breadfund.memberWithdrawableBalance(id, member3), 0);

    // Members receive withdrawables + fair share of the split
    uint256 m1After = token.balanceOf(member1);
    uint256 m2After = token.balanceOf(member2);
    uint256 m3After = token.balanceOf(member3);

    assertEq(m1After - m1Before, w1 + split);
    assertEq(m2After - m2Before, w2 + split);
    assertEq(m3After - m3Before, w3 + split);

    // Dust remainder (if any) stays in the contract
    uint256 cBalAfter = token.balanceOf(address(breadfund));
    assertEq(cBalAfter, remainder, "dust remainder retained");
  }
}