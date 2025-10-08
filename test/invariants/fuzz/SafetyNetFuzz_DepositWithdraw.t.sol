// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafetyNetFuzzBase} from './SafetyNetFuzzBase.t.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

contract SafetyNetFuzz_DepositWithdraw is SafetyNetFuzzBase {
  function testFuzz_Soak_ManyDepositsAndWithdrawals(uint8 epochsRaw, uint8 opsRaw, uint256 extraSeed) public {
    uint256 epochs = bound(uint256(epochsRaw), 2, 12);
    uint256 ops = bound(uint256(opsRaw), 5, 40);

    ISafetyNet.SafetyNet memory config = safeCfg;
    config.safetyNetStart = block.timestamp;
    config.members = defaultMembers;
    config.ratio = 1;
    uint256 id = _safetyNet.create(config);

    _mintApprove(member1, 1e24, address(_safetyNet));
    _mintApprove(member2, 1e24, address(_safetyNet));
    _mintApprove(member3, 1e24, address(_safetyNet));

    uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, epochs, ops, extraSeed)));

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = _pick(defaultMembers, seed);

        this.caseDeposit(id, actor, seed);
        this.caseSmallWithdraw(id, actor, seed, config);
        this.caseLargeWithdraw(id, actor, seed, config);
        this.caseMaybeExecuteLatest(config, actor);
      }
      vm.warp(block.timestamp + config.epochDuration + 1);
    }
  }

  // ── Case 1: Deposits — 1 per member per epoch; flag set; balance increases
  function caseDeposit(uint256 id, address actor, uint256 seed) external {
    ISafetyNet.SafetyNet memory safetyNetSnapshot = _safetyNet.getSafetyNet(id);

    uint256 epochIndex = _safetyNet.getCurrentEpochIndex(id);
    uint256 beforeWithdrawable = _safetyNet.memberWithdrawableBalance(id, actor);
    uint256 duesRemainingBefore = _safetyNet.duesRemainingThisEpoch(id, actor);

    if (duesRemainingBefore == 0) {
      // already fully paid this epoch → any extra should exceed cap
      vm.prank(actor);
      vm.expectRevert(ISafetyNet.ExceedsDepositAmount.selector);
      try _safetyNet.deposit(id, 1) {} catch {}
      return;
    }

    // draw a positive amount within remaining due (used for non-onboarding path)
    uint256 valueCandidate = 1e18 + (seed % 1e18);
    uint256 pickedWithinDues = valueCandidate % (duesRemainingBefore + 1);
    if (pickedWithinDues == 0) pickedWithinDues = duesRemainingBefore;

    uint256 depositedAmount;

    vm.startPrank(actor);
    if (_safetyNet.safetyNetMemberContribute(id, actor) == 0) {
      // epoch 0 – must pay exactly initialDeposit
      _safetyNet.deposit(id, safetyNetSnapshot.initialDeposit);
      depositedAmount = safetyNetSnapshot.initialDeposit;
    } else {
      // subsequent epochs – partials allowed up to fixedDeposit
      // (duesRemainingBefore > 0 here, so pickedWithinDues ∈ [1, duesRemainingBefore])
      _safetyNet.deposit(id, pickedWithinDues);
      depositedAmount = pickedWithinDues;
    }
    vm.stopPrank();

    // Re-check dues after the deposit and assert the flag reflects "fully paid"
    uint256 duesRemainingAfter = _safetyNet.duesRemainingThisEpoch(id, actor);
    bool paidAfter = _safetyNet.hasMemberDepositedInEpoch(id, actor, epochIndex);
    assertEq(paidAfter, duesRemainingAfter == 0, 'flag only when epoch fully paid');

    uint256 afterWithdrawable = _safetyNet.memberWithdrawableBalance(id, actor);
    assertEq(afterWithdrawable, beforeWithdrawable + depositedAmount, 'withdrawable += deposited amt');
  }

  // ── Case 2: Small withdrawals — within limit, ≤ autoThreshold, and ≤ balance
  function caseSmallWithdraw(uint256 id, address actor, uint256 seed, ISafetyNet.SafetyNet memory config) external {
    uint256 epochIndex = _safetyNet.getCurrentEpochIndex(id);
    uint256 contrib = _safetyNet.safetyNetMemberContribute(id, actor);
    uint256 beforeWithdrawable = _safetyNet.memberWithdrawableBalance(id, actor);

    uint256 daysReq = 1 + (seed % 3);
    uint256 want = (contrib / 30) * daysReq;

    uint256 cntBefore = _safetyNet.smallWithdrawsCount(id, epochIndex, actor);
    uint256 balBefore = token.balanceOf(actor);
    bool withinLimit = cntBefore < config.smallWithdrawsLimit;
    bool smallByAmt = (want <= config.autoThreshold);
    bool enoughBalance = (want <= beforeWithdrawable);

    vm.prank(actor);
    try _safetyNet.withdraw(id, daysReq) {
      uint256 nowW = _safetyNet.memberWithdrawableBalance(id, actor);
      uint256 balNow = token.balanceOf(actor);
      uint256 cntNow = _safetyNet.smallWithdrawsCount(id, epochIndex, actor);

      if (want == 0) {
        // Intentional: zero-amount small withdraw still increments counter (balance unchanged)
        assertEq(nowW, beforeWithdrawable);
        assertEq(balNow, balBefore);
        assertEq(cntNow, cntBefore + 1);
        _assertSmallCounterBound(id, epochIndex, actor, config.smallWithdrawsLimit);
      } else if (smallByAmt && withinLimit && enoughBalance) {
        assertEq(beforeWithdrawable - nowW, want);
        assertEq(balNow - balBefore, want);
        assertEq(cntNow, cntBefore + 1);
        _assertSmallCounterBound(id, epochIndex, actor, config.smallWithdrawsLimit);
      } else {
        assertTrue(false, 'withdraw succeeded though conditions not met');
      }
    } catch { /* many branches legitimately revert */ }
  }

  // ── Case 3: Large withdrawals — create a request; execution after contest window
  function caseLargeWithdraw(uint256 id, address actor, uint256 seed, ISafetyNet.SafetyNet memory config) external {
    uint256 contrib = _safetyNet.safetyNetMemberContribute(id, actor);
    uint256 beforeWithdrawable = _safetyNet.memberWithdrawableBalance(id, actor);
    uint256 daysReq = 40 + (seed % 40);
    uint256 want = (contrib / 30) * daysReq;

    uint256 reqsBefore = _safetyNet.nextIdRequest();

    vm.prank(actor);
    try _safetyNet.withdraw(id, daysReq) {
      uint256 reqsAfter = _safetyNet.nextIdRequest();
      if (want > config.autoThreshold) {
        if (want <= beforeWithdrawable && want > 0) {
          assertEq(reqsAfter, reqsBefore + 1, 'large creates request');
          uint256 reqId = reqsAfter - 1;
          (address owner,, uint256 ts, uint256 yesVotes, uint256 noVotes, uint256 amount) = _safetyNet.requests(reqId);
          assertEq(owner, actor);
          assertEq(amount, want);
          assertEq(yesVotes, 0);
          assertEq(noVotes, 0);
          assertGe(block.timestamp, ts);
          assertFalse(_safetyNet.isExecuted(reqId));

          if ((seed & 1) == 1) {
            vm.warp(block.timestamp + config.contestWindow + 1);
            vm.prank(actor);
            try _safetyNet.executeContestedWithdrawal(reqId) {
              assertTrue(_safetyNet.isExecuted(reqId));
            } catch {}
          }
        } else {
          assertEq(_safetyNet.nextIdRequest(), reqsBefore, 'no request if insufficient');
        }
      }
    } catch {}
  }

  // ── Case 4: Request execution attempt — only possible after contest window
  function caseMaybeExecuteLatest(ISafetyNet.SafetyNet memory config, address actor) external {
    uint256 nReq = _safetyNet.nextIdRequest();
    if (nReq == 0) return;

    uint256 reqId = nReq - 1;
    vm.warp(block.timestamp + config.contestWindow + 1);
    vm.prank(actor);
    try _safetyNet.executeContestedWithdrawal(reqId) {} catch {}
  }

  /// Small-withdraw limit fuzzing
  function testFuzz_SmallWithdrawsRespectLimit(uint8 daysReqRaw, uint8 extraWithdrawsRaw) public {
    ISafetyNet.SafetyNet memory config = safeCfg;
    config.members = defaultMembers;
    config.ratio = 1;
    config.safetyNetStart = block.timestamp;
    uint256 id = _safetyNet.create(config);

    uint256 daysRequested = bound(uint256(daysReqRaw), 1, 3);
    uint256 extraWithdraws = bound(uint256(extraWithdrawsRaw), 0, 2);

    // craft deposit size so each withdraw is under autoThreshold
    uint256 perWithdrawCap = (config.autoThreshold - 1) / 4;
    if (perWithdrawCap == 0) perWithdrawCap = 1;

    uint256 dep = (perWithdrawCap * 30) / daysRequested;
    if (dep == 0) dep = 1;

    uint256 perWithdraw = (dep / 30) * daysRequested;
    if (perWithdraw == 0) {
      dep = daysRequested * 30;
      perWithdraw = (dep / 30) * daysRequested;
      if (perWithdraw >= perWithdrawCap) {
        dep = dep / 2;
        if (dep == 0) dep = 1;
        perWithdraw = (dep / 30) * daysRequested;
        if (perWithdraw == 0) perWithdraw = 1;
      }
    }

    uint256 planned = (config.smallWithdrawsLimit + extraWithdraws) * perWithdraw;
    if (dep < planned) dep = planned;

    // Prefund up to `planned` while respecting onboarding + per-epoch caps
    uint256 remaining = planned;
    while (remaining > 0) {
      // First ever deposit must be EXACTLY initialDeposit, independent of epoch dues.
      if (_safetyNet.safetyNetMemberContribute(id, member1) == 0) {
        _mintApprove(member1, config.initialDeposit + config.fixedDeposit, address(_safetyNet));
        vm.prank(member1);
        _safetyNet.deposit(id, config.initialDeposit);
        continue;
      }

      // After onboarding, pay against this epoch’s remaining dues.
      uint256 due = _safetyNet.duesRemainingThisEpoch(id, member1);
      if (due == 0) {
        vm.warp(block.timestamp + config.epochDuration + 1);
        continue;
      }
      uint256 pay = remaining > due ? due : remaining;
      _mintApprove(member1, pay + config.fixedDeposit, address(_safetyNet));
      vm.prank(member1);
      _safetyNet.deposit(id, pay);
      remaining -= pay;
    }

    for (uint256 i = 0; i < config.smallWithdrawsLimit; i++) {
      vm.prank(member1);
      _safetyNet.withdraw(id, daysRequested);
    }

    for (uint256 j = 0; j < extraWithdraws; j++) {
      vm.prank(member1);
      vm.expectRevert(ISafetyNet.ExceedsSmallWithdrawalLimit.selector);
      _safetyNet.withdraw(id, daysRequested);
    }

    // After advancing to new epoch, limit resets
    vm.warp(block.timestamp + config.epochDuration + 1);
    vm.prank(member1);
    _safetyNet.withdraw(id, daysRequested);
  }
}
