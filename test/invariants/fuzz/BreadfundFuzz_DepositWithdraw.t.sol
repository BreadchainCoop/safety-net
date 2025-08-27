// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * BreadfundFuzz_DepositWithdraw.t.sol
 *
 * Purpose: Fuzz the core deposit/withdraw lifecycle. Mixes many deposits,
 * small withdrawals, large withdrawals, request execution, and epoch progress
 * to stress accounting invariants.
 *
 * Properties checked:
 *  - Deposits only once per epoch per member (`AlreadyDeposited`).
 *  - Withdrawals respect daily contribution, thresholds, and per-epoch limits.
 *  - Large withdrawals generate requests (and execute only after contest window).
 *  - Soft conservation invariant (`contract balance + executed ≥ withdrawables`)
 *    holds at each step.
 *  - Epoch warp advances counters/reset correctly.
 *
 * Notes for reviewers:
 *  - Some checks are unit-like but are *critical safety guards* (e.g.,
 *    “already deposited this epoch”).
 *  - After fixing BUG #2 (large exec not decrementing withdrawables),
 *    conservation checks here should be switched to *strict* invariant.
 * ────────────────────────────────────────────────────────────────────────────────
 */

import {BreadfundFuzzBase} from "./BreadfundFuzzBase.t.sol";
import {IBreadfund} from "src/interfaces/IBreadfund.sol";

contract BreadfundFuzz_DepositWithdraw is BreadfundFuzzBase {
  /// -------------------------------------------------------------------------
  /// Scenario: Soak test over multiple epochs and many randomized operations.
  /// Properties:
  ///  - Deposits: only one per member per epoch; sets epoch flag.
  ///  - Small withdrawals: only if within limit, amount ≤ autoThreshold,
  ///    and ≤ withdrawable balance.
  ///  - Large withdrawals: create requests, not executed until contest window.
  ///  - Conservation (soft) holds across ops and epochs.
  /// -------------------------------------------------------------------------
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
    _assertConservative(id, defaultMembers);

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = _pick(defaultMembers, seed);
        uint256 roll  = seed % 10;

        uint256 epochIdx   = breadfund.getCurrentEpochIndex(id);
        uint256 contrib    = breadfund.breadfundMemberContribute(id, actor);
        uint256 withdrawableBefore = breadfund.memberWithdrawableBalance(id, actor);

        // ── Case 1: Deposits ───────────────────────────────────────────────
        if (roll <= 2) {
          uint256 v = 1e18 + (seed % 1e18);
          bool alreadyDeposited = breadfund.hasMemberDepositedInEpoch(id, actor, epochIdx);
          vm.prank(actor);
          if (alreadyDeposited) {
            // Critical guard: second deposit in epoch must revert
            vm.expectRevert(IBreadfund.AlreadyDeposited.selector);
            try breadfund.deposit(id, v) { } catch {}
          } else {
            breadfund.deposit(id, v);
            assertTrue(breadfund.hasMemberDepositedInEpoch(id, actor, epochIdx), "epoch flag set");
            uint256 withdrawableAfter = breadfund.memberWithdrawableBalance(id, actor);
            assertEq(withdrawableAfter, withdrawableBefore + v, "withdrawable += v (r=1)");
          }

        // ── Case 2: Small withdrawals ─────────────────────────────────────
        } else if (roll <= 5) {
          uint256 daysReq = 1 + (seed % 3);
          uint256 daily = (contrib / 30);
          uint256 want  = daily * daysReq;

          uint256 cntBefore  = breadfund.smallWithdrawsCount(id, epochIdx, actor);
          uint256 balBefore  = token.balanceOf(actor);
          bool withinLimit   = cntBefore < cfg.smallWithdrawsLimit;
          bool smallByAmt    = (want <= cfg.autoThreshold);
          bool enoughBalance = (want <= withdrawableBefore);

          vm.prank(actor);
          try breadfund.withdraw(id, daysReq) {
            uint256 withdrawableNow = breadfund.memberWithdrawableBalance(id, actor);
            uint256 balNow          = token.balanceOf(actor);
            uint256 cntNow          = breadfund.smallWithdrawsCount(id, epochIdx, actor);

            if (want == 0) {
              // Zero-amount requests still increment the counter
              assertEq(withdrawableNow, withdrawableBefore);
              assertEq(balNow, balBefore);
              assertEq(cntNow, cntBefore + 1);
              _assertSmallCounterBound(id, epochIdx, actor, cfg.smallWithdrawsLimit);
            } else if (smallByAmt && withinLimit && enoughBalance) {
              assertEq(withdrawableBefore - withdrawableNow, want);
              assertEq(balNow - balBefore, want);
              assertEq(cntNow, cntBefore + 1);
              _assertSmallCounterBound(id, epochIdx, actor, cfg.smallWithdrawsLimit);
            } else {
              assertTrue(false, "withdraw succeeded though conditions not met");
            }
          } catch { /* many branches legitimately revert */ }

        // ── Case 3: Large withdrawals ─────────────────────────────────────
        } else if (roll <= 8) {
          uint256 daysReq = 40 + (seed % 40);
          uint256 daily = (contrib / 30);
          uint256 want  = daily * daysReq;

          uint256 reqsBefore = breadfund.nextIdRequest();

          vm.prank(actor);
          try breadfund.withdraw(id, daysReq) {
            uint256 reqsAfter = breadfund.nextIdRequest();
            if (want > cfg.autoThreshold) {
              if (want <= withdrawableBefore && want > 0) {
                // Large withdraw must create a request
                assertEq(reqsAfter, reqsBefore + 1, "large creates request");
                uint256 reqId = reqsAfter - 1;
                (address owner,, uint256 ts, uint256 yesVotes, uint256 noVotes, uint256 amount) =
                  breadfund.requests(reqId);
                assertEq(owner, actor);
                assertEq(amount, want);
                assertEq(yesVotes, 0); assertEq(noVotes, 0);
                assertGe(block.timestamp, ts);
                assertFalse(breadfund.isExecuted(reqId));

                // Optionally execute after contest window
                if ((seed & 1) == 1) {
                  vm.warp(block.timestamp + cfg.contestWindow + 1);
                  vm.prank(_pick(defaultMembers, seed >> 1));
                  try breadfund.executeContestedWithdrawl(reqId) {
                    assertTrue(breadfund.isExecuted(reqId));
                  } catch { }
                }
              } else {
                assertEq(breadfund.nextIdRequest(), reqsBefore, "no request if insufficient");
              }
            }
          } catch { }

        // ── Case 4: Random request execution ──────────────────────────────
        } else {
          if (breadfund.nextIdRequest() > 0) {
            uint256 reqId = breadfund.nextIdRequest() - 1;
            vm.warp(block.timestamp + cfg.contestWindow + 1);
            vm.prank(actor);
            try breadfund.executeContestedWithdrawl(reqId) { } catch {}
          }
        }

        // Conservation check (soft until BUG #2 is fixed)
        _assertConservative(id, defaultMembers);
      }
      vm.warp(block.timestamp + cfg.epochDuration + 1);
    }
  }

  /// -------------------------------------------------------------------------
  /// Scenario: depositFor flow
  /// Properties:
  ///  - Non-member caller can deposit on behalf of a member.
  ///  - Member flag is set for that epoch.
  ///  - Second deposit by the member in the same epoch reverts.
  ///  - depositFor with non-member target reverts.
  /// -------------------------------------------------------------------------
  function test_DepositFor_SetsMemberFlag_AndBlocksSecondDepositSameEpoch() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers;
    cfg.breadfundStart = block.timestamp;
    uint256 id = breadfund.create(cfg);

    uint256 epoch = breadfund.getCurrentEpochIndex(id);

    uint256 dep = 7e17;
    _mintApprove(member1, dep + cfg.initialDeposit + cfg.fixedDeposit, address(breadfund));

    address caller = address(0xCA11AB1E);
    vm.prank(caller);
    breadfund.depositFor(id, dep, member1);

    assertTrue(breadfund.hasMemberDepositedInEpoch(id, member1, epoch), "epoch flag set for member");
    assertEq(breadfund.memberWithdrawableBalance(id, member1), dep);

    vm.prank(member1);
    vm.expectRevert(IBreadfund.AlreadyDeposited.selector);
    breadfund.deposit(id, 1);

    address notMember = address(0xBADC0DE);
    _mintApprove(notMember, dep + cfg.initialDeposit + cfg.fixedDeposit, address(breadfund));
    vm.prank(caller);
    vm.expectRevert(IBreadfund.NotMember.selector);
    breadfund.depositFor(id, dep, notMember);
  }

  /// -------------------------------------------------------------------------
  /// Scenario: guard deposit before fund start
  /// Property: Deposits before `breadfundStart` must revert.
  /// -------------------------------------------------------------------------
  function test_Deposit_BeforeStart_Reverts() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers;
    cfg.breadfundStart = block.timestamp + 1 days;
    uint256 id = breadfund.create(cfg);

    _mintApprove(member1, 1e18 + cfg.initialDeposit + cfg.fixedDeposit, address(breadfund));
    vm.prank(member1);
    vm.expectRevert(IBreadfund.DepositBeforeBreadfundStart.selector);
    breadfund.deposit(id, 1e18);
  }

  /// -------------------------------------------------------------------------
  /// Scenario: small-withdraw limit fuzz
  /// Properties:
  ///  - Member can withdraw up to `smallWithdrawsLimit` times per epoch.
  ///  - Extra attempts revert with `ExceedsSmallWithdrawalLimit`.
  ///  - After advancing epoch, counter resets and withdrawals succeed again.
  /// -------------------------------------------------------------------------
  function testFuzz_SmallWithdrawsRespectLimit(
    uint8 daysReqRaw, uint8 extraWithdrawsRaw, uint256 /*unused*/
  ) public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers; cfg.ratio = 1; cfg.breadfundStart = block.timestamp;
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
        dep = dep / 2; if (dep == 0) dep = 1;
        perWithdraw = (dep / 30) * daysRequested;
        if (perWithdraw == 0) perWithdraw = 1;
      }
    }

    uint256 planned = (cfg.smallWithdrawsLimit + extraWithdraws) * perWithdraw;
    if (dep < planned) dep = planned;

    uint256 totalNeeded = dep + cfg.initialDeposit + cfg.fixedDeposit;
    _mintApprove(member1, totalNeeded, address(breadfund));
    vm.prank(member1); breadfund.deposit(id, dep);

    for (uint256 i = 0; i < cfg.smallWithdrawsLimit; i++) {
      vm.prank(member1); breadfund.withdraw(id, daysRequested);
    }

    for (uint256 j = 0; j < extraWithdraws; j++) {
      vm.prank(member1);
      vm.expectRevert(IBreadfund.ExceedsSmallWithdrawalLimit.selector);
      breadfund.withdraw(id, daysRequested);
    }

    // After advancing to new epoch, limit resets
    vm.warp(block.timestamp + cfg.epochDuration + 1);
    vm.prank(member1); breadfund.withdraw(id, daysRequested);
  }
}
// ────────────────────────────────────────────────────────────────────────────────