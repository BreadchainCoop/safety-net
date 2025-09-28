// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafetyNetFuzzBase} from './SafetyNetFuzzBase.t.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

contract SafetyNetFuzz_Decommission is SafetyNetFuzzBase {
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
    uint256 dep1Raw,
    uint256 dep2Raw,
    uint256 dep3Raw,
    uint8 skipEpochsRaw
  ) public {
    uint256 dep1 = bound(dep1Raw, 1e17, 5e19);
    uint256 dep2 = bound(dep2Raw, 1e17, 5e19);
    uint256 dep3 = bound(dep3Raw, 1e17, 5e19);
    uint256 skipEpochs = bound(uint256(skipEpochsRaw), 1, 4);

    ISafetyNet.SafetyNet memory cfg = safeCfg;
    cfg.safetyNetStart = block.timestamp;
    cfg.members = defaultMembers;
    cfg.ratio = 1;
    uint256 id = safetyNet.create(cfg);

    // Pre-fund with enough allowance for multiple deposits.
    _mintApprove(member1, dep1 + dep1 + 2 * (cfg.initialDeposit + cfg.fixedDeposit), address(safetyNet));
    _mintApprove(member2, dep2 + dep2 + 2 * (cfg.initialDeposit + cfg.fixedDeposit), address(safetyNet));
    _mintApprove(member3, dep3 + dep3 + 2 * (cfg.initialDeposit + cfg.fixedDeposit), address(safetyNet));

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
    assertTrue(safetyNet.isDecommissionable(id), 'decommissionable after a missed epoch');

    // Snapshot before decommission
    uint256 cBalBefore = token.balanceOf(address(safetyNet));
    uint256 w1 = safetyNet.memberWithdrawableBalance(id, member1);
    uint256 w2 = safetyNet.memberWithdrawableBalance(id, member2);
    uint256 w3 = safetyNet.memberWithdrawableBalance(id, member3);
    uint256 sumW = w1 + w2 + w3;

    assertGe(cBalBefore, sumW, 'contract covers withdrawables here');

    // Split of remainder among 3 members (equal share)
    uint256 remaining = cBalBefore - sumW;
    uint256 split = remaining / 3;
    uint256 remainder = remaining % 3;

    uint256 m1Before = token.balanceOf(member1);
    uint256 m2Before = token.balanceOf(member2);
    uint256 m3Before = token.balanceOf(member3);

    // Execute decommission
    safetyNet.decommission(id);

    // Fund should be marked as not commissioned anymore
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    safetyNet.getSafetyNet(id);

    // All withdrawables zeroed out
    assertEq(safetyNet.memberWithdrawableBalance(id, member1), 0);
    assertEq(safetyNet.memberWithdrawableBalance(id, member2), 0);
    assertEq(safetyNet.memberWithdrawableBalance(id, member3), 0);

    // Members receive withdrawables + fair share of the split
    uint256 m1After = token.balanceOf(member1);
    uint256 m2After = token.balanceOf(member2);
    uint256 m3After = token.balanceOf(member3);

    assertEq(m1After - m1Before, w1 + split);
    assertEq(m2After - m2Before, w2 + split);
    assertEq(m3After - m3Before, w3 + split);

    // Dust remainder (if any) stays in the contract
    uint256 cBalAfter = token.balanceOf(address(safetyNet));
    assertEq(cBalAfter, remainder, 'dust remainder retained');
  }
}
