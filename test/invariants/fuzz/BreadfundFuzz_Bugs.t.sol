// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * BreadfundFuzz_Bugs.t.sol
 *
 * Purpose: Executable specifications of KNOWN BUGS. These tests demonstrate
 * current broken behaviors so reviewers see impact and reproduction clearly.
 *
 * Conventions:
 * - Each test name ends with `_BUG` (or `_Critical_BUG`) to signal intent.
 * - Short headers explain the scenario + impact.
 * - A "When fixed:" note says how the test should change after the patch.
 *
 * IMPORTANT: These tests are expected to PASS while the bug exists (i.e., they
 * assert the *bad* outcome). After fixing, flip the expectations accordingly.
 * ────────────────────────────────────────────────────────────────────────────────
 */

import {BreadfundFuzzBase} from "./BreadfundFuzzBase.t.sol";
import {IBreadfund} from "src/interfaces/IBreadfund.sol";

contract BreadfundFuzz_Bugs is BreadfundFuzzBase {
  /// -------------------------------------------------------------------------
  /// BUG #1 — Duplicate members are accepted
  /// Scenario: Create with a duplicated address in `members`.
  /// Impact: Inflates `members.length` (affecting vote thresholds) and corrupts
  ///         per-member indexes (recorded twice in `memberBreadfunds`).
  /// When fixed: `breadfund.create(cfg)` should revert on duplicates.
  ///             Update this test to `vm.expectRevert(IBreadfund.DuplicateMember.selector)`
  ///             (or the chosen error) before calling `create`.
  /// -------------------------------------------------------------------------
  function test_Create_AllowsDuplicatesAndBreaksAccounting_BUG() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.breadfundStart = block.timestamp + 1;
    cfg.members = _threeMembers();
    address a = cfg.members[0];
    cfg.members[1] = a; // duplicate

    uint256 id = breadfund.create(cfg);

    IBreadfund.Breadfund memory stored = breadfund.getBreadfund(id);
    assertEq(stored.members.length, 3, "length reflects duplicates");

    uint256[] memory ids = breadfund.getMemberBreadfunds(a);
    assertEq(ids.length, 2, "duplicate member recorded twice in memberBreadfunds");
    assertEq(stored.members.length, 3, "inflated members length raises the yesVotes threshold");
  }

  /// -------------------------------------------------------------------------
  /// BUG #2 — Large request execution does not decrement withdrawables
  /// Scenario: Member deposits, requests a >autoThreshold withdrawal, it executes
  ///           after the contest window.
  /// Impact: Contract balance can be < sum of member withdrawables (insolvent state).
  /// When fixed: After execution, per-member withdrawables must go down by `amount`
  ///             (or be otherwise rebalanced). Replace the final assertion with
  ///             a strict conservation / per-member delta check.
  /// -------------------------------------------------------------------------
  function test_LargeExecution_DoesNotDecrementWithdrawable_BUG() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.breadfundStart = block.timestamp;
    cfg.members = defaultMembers; cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    uint256 dep = 3e18;
    _mintApprove(member1, dep + cfg.initialDeposit + cfg.fixedDeposit, address(breadfund));
    vm.prank(member1); breadfund.deposit(id, dep);

    uint256 daily = dep / 30;
    uint256 want  = cfg.autoThreshold + 1;
    uint256 daysRequested = (want + daily - 1) / daily;
    vm.prank(member1); breadfund.withdraw(id, daysRequested);
    uint256 reqId = breadfund.nextIdRequest() - 1;

    vm.warp(block.timestamp + cfg.contestWindow + 1);
    vm.prank(member2); breadfund.executeContestedWithdrawl(reqId);

    uint256 sumW;
    for (uint256 i = 0; i < defaultMembers.length; i++) {
      sumW += breadfund.memberWithdrawableBalance(id, defaultMembers[i]);
    }
    uint256 bal = token.balanceOf(address(breadfund));
    assertLt(bal, sumW, "BUG: contract balance can drop below sum of withdrawables after large execution");
  }

  /// -------------------------------------------------------------------------
  /// BUG #2b (CRITICAL) — Anyone can create & drain a request
  /// Scenario: Non-member/attacker crafts a Request pointing to an existing fund.
  /// Impact: Unauthorized transfer of fund tokens to attacker after contest window.
  /// When fixed: `createRequest` must enforce ownership/membership and revert
  ///             if `msg.sender` is not allowed. Update to expect that revert.
  /// -------------------------------------------------------------------------
  function test_AnyoneCanCreateAndDrainRequest_Critical_BUG() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.breadfundStart = block.timestamp; cfg.members = defaultMembers; cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    uint256 dep = 2e18;
    _mintApprove(member1, dep + cfg.initialDeposit + cfg.fixedDeposit, address(breadfund));
    vm.prank(member1); breadfund.deposit(id, dep);

    address attacker = address(0xBADBEEF);
    uint256 amount = 5e17;
    IBreadfund.Request memory r = IBreadfund.Request({
      owner: attacker, breadfundId: id, timestamp: block.timestamp, yesVotes: 0, noVotes: 0, amount: amount
    });

    vm.prank(attacker);
    uint256 reqId = breadfund.createRequest(r);

    vm.warp(block.timestamp + cfg.contestWindow + 1);
    uint256 before = token.balanceOf(attacker);
    vm.prank(member2); breadfund.executeContestedWithdrawl(reqId);
    uint256 after_ = token.balanceOf(attacker);

    assertEq(after_ - before, amount, "attacker drained funds");
    assertTrue(breadfund.isExecuted(reqId), "request marked executed");
  }

  /// -------------------------------------------------------------------------
  /// BUG #3 (SPEC) — Any positive deposit is accepted (no “exact dues” rule)
  /// Scenario: Deposit a tiny amount and a huge amount; both are credited 1:1.
  /// Impact: Policy/spec deviation if protocol expects exact dues per epoch.
  /// When fixed: Replace with tests that enforce exact/allowed amounts, e.g.
  ///             `vm.expectRevert(IBreadfund.InvalidAmount.selector)` for wrong dues.
  /// -------------------------------------------------------------------------
  function test_Deposit_AnyPositiveAmountAccepted_SPEC_DEP_BUG() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.breadfundStart = block.timestamp; cfg.members = defaultMembers; cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    uint256 tiny = 1;
    _mintApprove(member1, tiny + cfg.initialDeposit + cfg.fixedDeposit, address(breadfund));
    vm.prank(member1); breadfund.deposit(id, tiny);
    assertEq(breadfund.memberWithdrawableBalance(id, member1), tiny, "tiny deposit accepted");

    uint256 huge = 1e21;
    _mintApprove(member2, huge + cfg.initialDeposit + cfg.fixedDeposit, address(breadfund));
    vm.prank(member2); breadfund.deposit(id, huge);
    assertEq(breadfund.memberWithdrawableBalance(id, member2), huge, "huge deposit accepted");
  }

  /// -------------------------------------------------------------------------
  /// BUG #4 — First deposit locks daily cap forever
  /// Scenario: Small first deposit defines daily cap; later big deposit does not
  ///           update the cap across epochs.
  /// Impact: Permanent under-cap limiting withdrawals for that member.
  /// When fixed: After a larger subsequent deposit (new epoch), the daily cap
  ///             should increase accordingly. Update to `assertGt(dailyNow, daily0)`.
  /// -------------------------------------------------------------------------
  function test_FirstDepositTooSmall_LocksLowDailyCap_BUG() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.breadfundStart = block.timestamp; cfg.members = defaultMembers; cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    uint256 small = 1e18; uint256 big = 100e18;
    _mintApprove(member1, small + big + 2 * (cfg.initialDeposit + cfg.fixedDeposit), address(breadfund));

    _depositAs(member1, id, small);
    uint256 daily0 = breadfund.breadfundMemberContribute(id, member1) / 30;

    vm.warp(block.timestamp + cfg.epochDuration + 1);
    _depositAs(member1, id, big);

    uint256 dailyNow = breadfund.breadfundMemberContribute(id, member1) / 30;
    assertEq(dailyNow, daily0, "BUG: daily cap ignores later larger deposit");
  }

  /// -------------------------------------------------------------------------
  /// BUG #5 — Overpayment increases withdrawable but cap stays unchanged
  /// Scenario: Small deposit (sets cap), then a large overpayment in next epoch
  ///           credits withdrawable but does not raise daily cap.
  /// Impact: Liquidity credited but throttled by stale cap (policy/economic bug).
  /// When fixed: Expect `capDailyNow >= expected cap` reflecting the larger deposit.
  /// -------------------------------------------------------------------------
  function test_Overpayment_IncreasesWithdrawable_ButCapUnchanged_BUG() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.breadfundStart = block.timestamp; cfg.members = defaultMembers; cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    uint256 small = 1e18; uint256 big = 50e18;
    _mintApprove(member1, small + big + 2 * (cfg.initialDeposit + cfg.fixedDeposit), address(breadfund));

    _depositAs(member1, id, small);
    uint256 capDaily = breadfund.breadfundMemberContribute(id, member1) / 30;

    vm.warp(block.timestamp + cfg.epochDuration + 1);
    uint256 beforeW = breadfund.memberWithdrawableBalance(id, member1);
    _depositAs(member1, id, big);
    uint256 afterW  = breadfund.memberWithdrawableBalance(id, member1);

    assertEq(afterW - beforeW, big, "overpayment credited to withdrawable");
    uint256 capDailyNow = breadfund.breadfundMemberContribute(id, member1) / 30;
    assertEq(capDailyNow, capDaily, "BUG: daily cap unchanged despite overpayment");
  }

  /// -------------------------------------------------------------------------
  /// BUG #6 — Decommission reverts after prior large exec (“phantom funds”)
  /// Scenario: Execute a large request (which didn’t decrement withdrawables),
  ///           advance epoch, then attempt decommission.
  /// Impact: Decommission fails due to internal solvency/accounting mismatch.
  /// When fixed: Decommission should succeed (or fail for explicit policy reasons),
  ///             not because of accounting drift. Update to assert successful payout.
  /// -------------------------------------------------------------------------
  function test_Decommission_RevertsAfterPriorLargeExec_BUG() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.breadfundStart = block.timestamp; cfg.members = defaultMembers; cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    uint256 dep = 1e18;
    _mintApprove(member1, dep + cfg.initialDeposit + cfg.fixedDeposit, address(breadfund));
    vm.prank(member1); breadfund.deposit(id, dep);

    vm.prank(member1); breadfund.withdraw(id, 30);
    uint256 reqId = breadfund.nextIdRequest() - 1;

    vm.warp(block.timestamp + cfg.contestWindow + 1);
    vm.prank(member2); breadfund.executeContestedWithdrawl(reqId);

    vm.warp(block.timestamp + cfg.epochDuration + 1);
    assertTrue(breadfund.isDecommissionable(id));

    vm.expectRevert();
    breadfund.decommission(id);
  }
}
/// ────────────────────────────────────────────────────────────────────────────────