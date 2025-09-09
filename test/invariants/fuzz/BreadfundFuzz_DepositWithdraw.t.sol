// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BreadfundFuzzBase} from "./BreadfundFuzzBase.t.sol";
import {IBreadfund} from "src/interfaces/IBreadfund.sol";

contract BreadfundFuzz_DepositWithdraw is BreadfundFuzzBase {
  function testFuzz_Soak_ManyDepositsAndWithdrawals(
    uint8 epochsRaw, uint8 opsRaw, uint256 extraSeed
  ) public {
    uint256 epochs = bound(uint256(epochsRaw), 2, 12);
    uint256 ops    = bound(uint256(opsRaw),    5, 40);

    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.breadfundStart = block.timestamp;
    cfg.members        = defaultMembers;
    cfg.ratio          = 1;
    uint256 id = breadfund.create(cfg);

    _mintApprove(member1, 1e24, address(breadfund));
    _mintApprove(member2, 1e24, address(breadfund));
    _mintApprove(member3, 1e24, address(breadfund));

    uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, epochs, ops, extraSeed)));

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = _pick(defaultMembers, seed);

        this._caseDeposit(id, actor, seed);
        this._caseSmallWithdraw(id, actor, seed, cfg);
        this._caseLargeWithdraw(id, actor, seed, cfg);
        this._caseMaybeExecuteLatest(cfg, actor);
      }
      vm.warp(block.timestamp + cfg.epochDuration + 1);
    }
  }

  // ── Case 1: Deposits — 1 per member per epoch; flag set; balance increases
  function _caseDeposit(uint256 id, address actor, uint256 seed) external {
    uint256 epochIdx = breadfund.getCurrentEpochIndex(id);
    uint256 beforeW  = breadfund.memberWithdrawableBalance(id, actor);
    uint256 v        = 1e18 + (seed % 1e18);
    bool already     = breadfund.hasMemberDepositedInEpoch(id, actor, epochIdx);

    vm.prank(actor);
    if (already) {
      vm.expectRevert(IBreadfund.AlreadyDeposited.selector);
      try breadfund.deposit(id, v) { } catch {}
      return;
    }

    breadfund.deposit(id, v);
    assertTrue(breadfund.hasMemberDepositedInEpoch(id, actor, epochIdx), "epoch flag set");
    uint256 afterW = breadfund.memberWithdrawableBalance(id, actor);
    assertEq(afterW, beforeW + v, "withdrawable += v");
  }

  // ── Case 2: Small withdrawals — within limit, ≤ autoThreshold, and ≤ balance
  function _caseSmallWithdraw(uint256 id, address actor, uint256 seed, IBreadfund.Breadfund memory cfg) external {
    uint256 epochIdx = breadfund.getCurrentEpochIndex(id);
    uint256 contrib  = breadfund.breadfundMemberContribute(id, actor);
    uint256 beforeW  = breadfund.memberWithdrawableBalance(id, actor);

    uint256 daysReq = 1 + (seed % 3);
    uint256 want    = (contrib / 30) * daysReq;

    uint256 cntBefore  = breadfund.smallWithdrawsCount(id, epochIdx, actor);
    uint256 balBefore  = token.balanceOf(actor);
    bool withinLimit   = cntBefore < cfg.smallWithdrawsLimit;
    bool smallByAmt    = (want <= cfg.autoThreshold);
    bool enoughBalance = (want <= beforeW);

    vm.prank(actor);
    try breadfund.withdraw(id, daysReq) {
      uint256 nowW  = breadfund.memberWithdrawableBalance(id, actor);
      uint256 balNow = token.balanceOf(actor);
      uint256 cntNow = breadfund.smallWithdrawsCount(id, epochIdx, actor);

      if (want == 0) {
        // Intentional: zero-amount small withdraw still increments counter (balance unchanged)
        assertEq(nowW,  beforeW);
        assertEq(balNow, balBefore);
        assertEq(cntNow, cntBefore + 1);
        _assertSmallCounterBound(id, epochIdx, actor, cfg.smallWithdrawsLimit);
      } else if (smallByAmt && withinLimit && enoughBalance) {
        assertEq(beforeW - nowW, want);
        assertEq(balNow - balBefore, want);
        assertEq(cntNow, cntBefore + 1);
        _assertSmallCounterBound(id, epochIdx, actor, cfg.smallWithdrawsLimit);
      } else {
        assertTrue(false, "withdraw succeeded though conditions not met");
      }
    } catch { /* many branches legitimately revert */ }
  }

  // ── Case 3: Large withdrawals — create a request; execution after contest window
  function _caseLargeWithdraw(uint256 id, address actor, uint256 seed, IBreadfund.Breadfund memory cfg) external {
    uint256 contrib  = breadfund.breadfundMemberContribute(id, actor);
    uint256 beforeW  = breadfund.memberWithdrawableBalance(id, actor);
    uint256 daysReq  = 40 + (seed % 40);
    uint256 want     = (contrib / 30) * daysReq;

    uint256 reqsBefore = breadfund.nextIdRequest();

    vm.prank(actor);
    try breadfund.withdraw(id, daysReq) {
      uint256 reqsAfter = breadfund.nextIdRequest();
      if (want > cfg.autoThreshold) {
        if (want <= beforeW && want > 0) {
          assertEq(reqsAfter, reqsBefore + 1, "large creates request");
          uint256 reqId = reqsAfter - 1;
          (address owner,, uint256 ts, uint256 yesVotes, uint256 noVotes, uint256 amount) =
            breadfund.requests(reqId);
          assertEq(owner, actor);
          assertEq(amount, want);
          assertEq(yesVotes, 0);
          assertEq(noVotes, 0);
          assertGe(block.timestamp, ts);
          assertFalse(breadfund.isExecuted(reqId));

          if ((seed & 1) == 1) {
            vm.warp(block.timestamp + cfg.contestWindow + 1);
            vm.prank(actor); 
            try breadfund.executeContestedWithdrawal(reqId) {
              assertTrue(breadfund.isExecuted(reqId));
            } catch { }
          }
        } else {
          assertEq(breadfund.nextIdRequest(), reqsBefore, "no request if insufficient");
        }
      }
    } catch { }
  }

  // ── Case 4: Request execution attempt — only possible after contest window
  function _caseMaybeExecuteLatest(IBreadfund.Breadfund memory cfg, address actor) external {
    uint256 nReq = breadfund.nextIdRequest();
    if (nReq == 0) return;

    uint256 reqId = nReq - 1;
    vm.warp(block.timestamp + cfg.contestWindow + 1);
    vm.prank(actor);
    try breadfund.executeContestedWithdrawal(reqId) { } catch {}
  }

  /// Small-withdraw limit fuzzing
  function testFuzz_SmallWithdrawsRespectLimit(uint8 daysReqRaw, uint8 extraWithdrawsRaw) public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers;
    cfg.ratio = 1;
    cfg.breadfundStart = block.timestamp;
    uint256 id = breadfund.create(cfg);

    uint256 daysRequested  = bound(uint256(daysReqRaw), 1, 3);
    uint256 extraWithdraws = bound(uint256(extraWithdrawsRaw), 0, 2);

    // craft deposit size so each withdraw is under autoThreshold
    uint256 perWithdrawCap = (cfg.autoThreshold - 1) / 4;
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

    uint256 planned = (cfg.smallWithdrawsLimit + extraWithdraws) * perWithdraw;
    if (dep < planned) dep = planned;

    uint256 totalNeeded = dep + cfg.initialDeposit + cfg.fixedDeposit;
    _mintApprove(member1, totalNeeded, address(breadfund));
    vm.prank(member1);
    breadfund.deposit(id, dep);

    for (uint256 i = 0; i < cfg.smallWithdrawsLimit; i++) {
      vm.prank(member1);
      breadfund.withdraw(id, daysRequested);
    }

    for (uint256 j = 0; j < extraWithdraws; j++) {
      vm.prank(member1);
      vm.expectRevert(IBreadfund.ExceedsSmallWithdrawalLimit.selector);
      breadfund.withdraw(id, daysRequested);
    }

    // After advancing to new epoch, limit resets
    vm.warp(block.timestamp + cfg.epochDuration + 1);
    vm.prank(member1);
    breadfund.withdraw(id, daysRequested);
  }
}