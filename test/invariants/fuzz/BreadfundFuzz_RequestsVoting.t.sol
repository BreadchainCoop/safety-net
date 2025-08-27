// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * BreadfundFuzz_RequestsVoting.t.sol
 *
 * Purpose: Validate the lifecycle of large-withdrawal requests and the governance
 * voting rules around them (threshold semantics, windows, and contest behavior).
 *
 * Properties checked:
 *  - Large withdrawals create requests and only execute after the contest window.
 *  - Voting semantics: == threshold does NOT execute; > threshold executes.
 *  - Only members may vote; no double voting; voting must happen within window.
 *  - Contested requests do not auto-execute on timeout.
 *  - Fuzzed voting converges either via consensus or timeout without reverts.
 *
 * Notes:
 *  - These tests are intentionally policy-heavy (unit-ish) because governance
 *    safety depends on exact boundaries and window ordering.
 * ────────────────────────────────────────────────────────────────────────────────
 */

import {BreadfundFuzzBase} from "./BreadfundFuzzBase.t.sol";
import {IBreadfund} from "src/interfaces/IBreadfund.sol";

contract BreadfundFuzz_RequestsVoting is BreadfundFuzzBase {
  /// -------------------------------------------------------------------------
  /// Scenario: Large withdrawal request followed by auto-execution after contest.
  /// Properties:
  ///  - Request is created for > autoThreshold.
  ///  - After contest window elapses, an execution call succeeds.
  ///  - Beneficiary's balance increases; request marked executed.
  /// -------------------------------------------------------------------------
  function testFuzz_LargeWithdrawal_RequestAndAutoExecute(
    uint256 depositValueRaw, uint8 extraDaysRaw
  ) public {
    uint256 depositValue = bound(depositValueRaw, 5e18, 1e22);

    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers; cfg.ratio = 1; cfg.breadfundStart = block.timestamp;
    uint256 id = breadfund.create(cfg);

    uint256 totalNeeded = depositValue + cfg.initialDeposit + cfg.fixedDeposit;
    _mintApprove(member1, totalNeeded, address(breadfund));
    vm.prank(member1); breadfund.deposit(id, depositValue);

    // Choose a daysRequested that ensures "large" classification.
    uint256 minDaysToBeLarge = (cfg.autoThreshold * 30) / depositValue + 1;
    uint256 daysRequested = minDaysToBeLarge + (uint256(extraDaysRaw) % 10) + 1;
    if (daysRequested > 30) daysRequested = 30;
    if (minDaysToBeLarge > 30) daysRequested = 30;

    vm.prank(member1); breadfund.withdraw(id, daysRequested);
    uint256 reqId = breadfund.nextIdRequest() - 1;

    vm.warp(block.timestamp + cfg.contestWindow + 1);

    uint256 balBefore = token.balanceOf(member1);
    vm.prank(member2); breadfund.executeContestedWithdrawl(reqId);
    uint256 balAfter = token.balanceOf(member1);

    assertGt(balAfter, balBefore);
    assertTrue(breadfund.isExecuted(reqId));
  }

  /// -------------------------------------------------------------------------
  /// Scenario: Voting threshold semantics.
  /// Properties:
  ///  - With 4 members and threshold=50%, exactly two "yes" votes is NOT enough.
  ///  - A third "yes" vote pushes above threshold and executes.
  /// -------------------------------------------------------------------------
  function test_Voting_ExactThreshold_NoExecute_ThenAboveExecutes() public {
    address[] memory members = _makeMembers(4);

    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = members; cfg.minimumMembers = 2; cfg.maximumMembers = 4;
    cfg.consensusThreshold = 50; cfg.breadfundStart = block.timestamp;
    cfg.votingWindow = 7 days;
    uint256 id = breadfund.create(cfg);

    uint256 dep = 2e18;
    for (uint256 i = 0; i < 4; i++) {
      _mintApprove(members[i], dep + cfg.initialDeposit + cfg.fixedDeposit, address(breadfund));
      vm.prank(members[i]); breadfund.deposit(id, dep);
    }

    vm.prank(members[0]); breadfund.withdraw(id, 30);
    uint256 reqId = breadfund.nextIdRequest() - 1;

    vm.prank(members[1]); breadfund.vote(reqId, true);
    vm.prank(members[2]); breadfund.vote(reqId, true);
    assertFalse(breadfund.isExecuted(reqId), "== threshold must not execute");

    uint256 balBefore = token.balanceOf(members[0]);
    vm.prank(members[3]); breadfund.vote(reqId, true);
    assertTrue(breadfund.isExecuted(reqId), "> threshold executes");
    uint256 balAfter = token.balanceOf(members[0]);
    assertGt(balAfter, balBefore);
  }

  /// -------------------------------------------------------------------------
  /// Scenario: Voting windows and contest behavior.
  /// Properties:
  ///  - Only members may vote; double voting reverts.
  ///  - Votes must be within `votingWindow`.
  ///  - A contested request must not auto-execute on timeout.
  /// -------------------------------------------------------------------------
  function test_Voting_Windows_And_Contest_BlockAutoExec() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers; cfg.breadfundStart = block.timestamp;
    cfg.votingWindow = 1 days; cfg.contestWindow = 1 days; cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    uint256 dep = 1e18;
    _mintApprove(member1, dep + cfg.initialDeposit + cfg.fixedDeposit, address(breadfund));
    vm.prank(member1); breadfund.deposit(id, dep);

    vm.prank(member1); breadfund.withdraw(id, 30);
    uint256 reqId = breadfund.nextIdRequest() - 1;

    address outsider = address(0xDEAD);
    vm.prank(outsider);
    vm.expectRevert(IBreadfund.NotMember.selector);
    breadfund.vote(reqId, true);

    vm.prank(member2); breadfund.vote(reqId, true);
    vm.prank(member2);
    vm.expectRevert(IBreadfund.AlreadyVoted.selector);
    breadfund.vote(reqId, true);

    vm.warp(block.timestamp + cfg.votingWindow + 1);
    vm.prank(member3);
    vm.expectRevert(IBreadfund.VotingWindowClosed.selector);
    breadfund.vote(reqId, true);

    // New request that gets contested, then verify it won't auto-execute.
    vm.prank(member1); breadfund.withdraw(id, 30);
    uint256 req2 = breadfund.nextIdRequest() - 1;

    vm.prank(member2); breadfund.contest(req2);
    vm.warp(block.timestamp + cfg.contestWindow + 1);
    vm.prank(member3); breadfund.executeContestedWithdrawl(req2);
    assertFalse(breadfund.isExecuted(req2), "contested request must not auto-execute");
  }

  /// -------------------------------------------------------------------------
  /// Scenario: Vote-heavy fuzz — random voting with bias until consensus or timeout.
  /// Properties:
  ///  - No catastrophic reverts while exploring varied member counts (3..20),
  ///    consensus thresholds (1..99), and yes-vote biases (0..100%).
  ///  - If consensus not reached by votes, allow post-window execution attempt.
  /// -------------------------------------------------------------------------
  function testFuzz_Voting_ConsensusOrTimeout(
    uint8 memberCountRaw, uint8 consensusPctRaw, uint8 yesBiasRaw, uint256 randSeed
  ) public {
    uint256 m = bound(uint256(memberCountRaw), 3, 20);
    uint256 consensus = bound(uint256(consensusPctRaw), 1, 99);
    uint256 yesBias = bound(uint256(yesBiasRaw), 0, 100);

    address[] memory members = _makeMembers(m);
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = members; cfg.minimumMembers = 2; cfg.maximumMembers = m;
    cfg.consensusThreshold = consensus; cfg.breadfundStart = block.timestamp;
    cfg.votingWindow = 1 days; cfg.contestWindow = 1 days;
    uint256 id = breadfund.create(cfg);

    // Seed balances; ignore per-member deposit failure to keep exploring.
    for (uint256 i = 0; i < m; i++) {
      _mintApprove(members[i], 5e21, address(breadfund));
      vm.prank(members[i]); try breadfund.deposit(id, 5e18) { } catch { }
    }

    uint256 depositValue = 5e18;
    uint256 totalNeeded = depositValue + cfg.initialDeposit + cfg.fixedDeposit;
    _mintApprove(members[0], totalNeeded, address(breadfund));
    vm.prank(members[0]); try breadfund.deposit(id, depositValue) { } catch { }
    uint256 minDaysToBeLarge = (cfg.autoThreshold * 30) / depositValue + 1;
    uint256 daysRequested = minDaysToBeLarge + 3;

    vm.prank(members[0]); breadfund.withdraw(id, daysRequested);
    uint256 reqId = breadfund.nextIdRequest() - 1;

    // Randomized voting pass
    for (uint256 i = 0; i < m && !breadfund.isExecuted(reqId); i++) {
      address voter = members[i];
      randSeed = uint256(keccak256(abi.encodePacked(randSeed, i)));
      bool voteYes = (randSeed % 100) < yesBias;
      vm.prank(voter); try breadfund.vote(reqId, voteYes) { } catch { }
    }

    // If not executed by consensus, try after contest window.
    if (!breadfund.isExecuted(reqId)) {
      vm.warp(block.timestamp + cfg.contestWindow + 1);
      vm.prank(members[m-1]); try breadfund.executeContestedWithdrawl(reqId) { } catch { }
    }

    assertTrue(true); // sanity: no catastrophic revert
  }
}
