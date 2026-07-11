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
    uint256 depositAmountMember1 = bound(dep1Raw, 1e17, 5e19);
    uint256 depositAmountMember2 = bound(dep2Raw, 1e17, 5e19);
    uint256 depositAmountMember3 = bound(dep3Raw, 1e17, 5e19);
    uint256 skipEpochs = bound(uint256(skipEpochsRaw), 1, 4);

    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.redeemRatio = 1;
    uint256 safetyNetId = _createStarted(config, _defaultMembers);

    // Pre-fund with enough allowance for multiple deposits.
    _mintApprove(
      _member1, depositAmountMember1 + depositAmountMember1 + 2 * (config.initialDeposit + config.fixedDeposit), address(_safetyNet)
    );
    _mintApprove(
      _member2, depositAmountMember2 + depositAmountMember2 + 2 * (config.initialDeposit + config.fixedDeposit), address(_safetyNet)
    );
    _mintApprove(
      _member3, depositAmountMember3 + depositAmountMember3 + 2 * (config.initialDeposit + config.fixedDeposit), address(_safetyNet)
    );

    // Initial deposits
    _depositAs(_member1, safetyNetId, depositAmountMember1);
    _depositAs(_member2, safetyNetId, depositAmountMember2);
    _depositAs(_member3, safetyNetId, depositAmountMember3);

    // Next epoch: _member3 skips their payment
    vm.warp(block.timestamp + config.epochDuration + 1);
    _depositAs(_member1, safetyNetId, depositAmountMember1);
    _depositAs(_member2, safetyNetId, depositAmountMember2);
    // _member3 intentionally skips

    // Advance further epochs → fund should now be decommissionable
    vm.warp(block.timestamp + config.epochDuration * skipEpochs + 1);
    assertTrue(_safetyNet.isDecommissionable(safetyNetId), 'decommissionable after a missed epoch');

    // Snapshot before decommission
    uint256 cBalBefore = _token.balanceOf(address(_safetyNet));
    uint256 member1Withdrawable = _safetyNet.memberWithdrawableBalance(safetyNetId, _member1);
    uint256 member2Withdrawable = _safetyNet.memberWithdrawableBalance(safetyNetId, _member2);
    uint256 member3Withdrawable = _safetyNet.memberWithdrawableBalance(safetyNetId, _member3);
    uint256 totalWithdrawables = member1Withdrawable + member2Withdrawable + member3Withdrawable;

    assertGe(cBalBefore, totalWithdrawables, 'contract covers withdrawables here');

    // Split of remainder among 3 members (equal share)
    uint256 remaining = cBalBefore - totalWithdrawables;
    uint256 split = remaining / 3;
    uint256 remainder = remaining % 3;

    uint256 member1BalanceBefore = _token.balanceOf(_member1);
    uint256 member2BalanceBefore = _token.balanceOf(_member2);
    uint256 member3BalanceBefore = _token.balanceOf(_member3);

    // Execute decommission
    _safetyNet.decommission(safetyNetId);

    // Fund should be marked as not commissioned anymore
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    _safetyNet.getSafetyNet(safetyNetId);

    // All withdrawables zeroed out
    assertEq(_safetyNet.memberWithdrawableBalance(safetyNetId, _member1), 0);
    assertEq(_safetyNet.memberWithdrawableBalance(safetyNetId, _member2), 0);
    assertEq(_safetyNet.memberWithdrawableBalance(safetyNetId, _member3), 0);

    // Members receive withdrawables + fair share of the split
    uint256 member1BalanceAfter = _token.balanceOf(_member1);
    uint256 member2BalanceAfter = _token.balanceOf(_member2);
    uint256 member3BalanceAfter = _token.balanceOf(_member3);

    assertEq(member1BalanceAfter - member1BalanceBefore, member1Withdrawable + split);
    assertEq(member2BalanceAfter - member2BalanceBefore, member2Withdrawable + split);
    assertEq(member3BalanceAfter - member3BalanceBefore, member3Withdrawable + split);

    // Dust remainder (if any) stays in the contract
    uint256 cBalAfter = _token.balanceOf(address(_safetyNet));
    assertEq(cBalAfter, remainder, 'dust remainder retained');
  }
}
