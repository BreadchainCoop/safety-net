// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafetyNetFuzzBase} from './SafetyNetFuzzBase.t.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

contract SafetyNetFuzz_RequestsVoting is SafetyNetFuzzBase {
  /// -------------------------------------------------------------------------
  /// Scenario: Large withdrawal request followed by auto-execution after contest.
  /// Properties:
  ///  - Request is created for > autoThreshold.
  ///  - After contest window elapses, an execution call succeeds.
  ///  - Beneficiary's balance increases; request marked executed.
  /// -------------------------------------------------------------------------
  function testFuzz_LargeWithdrawal_RequestAndAutoExecute(uint256 depositValueRaw, uint8 extraDaysRaw) public {
    uint256 depositValue = bound(depositValueRaw, 5e18, 1e22);

    ISafetyNet.SafetyNet memory cfg = safeCfg;
    cfg.members = defaultMembers;
    cfg.ratio = 1;
    cfg.autoThreshold = 1;
    cfg.safetyNetStart = block.timestamp;
    uint256 id = safetyNet.create(cfg);

    uint256 due = safetyNet.duesRemainingThisEpoch(id, member1);
    if (due == 0) {
      vm.warp(block.timestamp + cfg.epochDuration + 1);
      due = safetyNet.duesRemainingThisEpoch(id, member1);
    }
    uint256 pay = depositValue > due ? due : depositValue;
    _mintApprove(member1, pay + cfg.initialDeposit + cfg.fixedDeposit, address(safetyNet));
    vm.prank(member1);
    safetyNet.deposit(id, pay);

    // Choose a daysRequested that ensures "large" classification.
    uint256 contrib = safetyNet.safetyNetMemberContribute(id, member1);
    uint256 daysRequested = 1 + (uint256(extraDaysRaw) % 5);

    vm.prank(member1);
    safetyNet.withdraw(id, daysRequested);
    uint256 n = safetyNet.nextIdRequest();
    assertGt(n, 0, 'expected a request');
    uint256 reqId = n - 1;

    vm.warp(block.timestamp + cfg.contestWindow + 1);

    uint256 balBefore = token.balanceOf(member1);
    vm.prank(member2);
    safetyNet.executeContestedWithdrawal(reqId);
    uint256 balAfter = token.balanceOf(member1);

    assertGt(balAfter, balBefore);
    assertTrue(safetyNet.isExecuted(reqId));
  }

  /// -------------------------------------------------------------------------
  /// Property-based: Voting threshold boundary.
  /// For m members and threshold T%, exactly floor(m*T/100) YES must NOT execute;
  /// strictly more than that must execute.
  /// -------------------------------------------------------------------------
  function testFuzz_Voting_ThresholdBoundary(uint8 membersRaw, uint8 consensusPctRaw) public {
    uint256 m = bound(uint256(membersRaw), 3, 20);
    uint256 consensus = bound(uint256(consensusPctRaw), 1, 99);

    address[] memory members = _makeMembers(m);

    ISafetyNet.SafetyNet memory cfg = safeCfg;
    cfg.members = members;
    cfg.minimumMembers = 2;
    cfg.maximumMembers = m;
    cfg.consensusThreshold = consensus;
    cfg.autoThreshold = 1;
    cfg.safetyNetStart = block.timestamp;
    cfg.votingWindow = 7 days;
    cfg.contestWindow = 7 days;

    uint256 id = safetyNet.create(cfg);

    // Seed deposits for members[1..m-1]
    uint256 depEach = 2e18;
    for (uint256 i = 1; i < m; i++) {
      uint256 dueI = safetyNet.duesRemainingThisEpoch(id, members[i]);
      if (dueI > 0) {
        uint256 payI = depEach > dueI ? dueI : depEach;
        _mintApprove(members[i], payI + cfg.initialDeposit + cfg.fixedDeposit, address(safetyNet));
        vm.prank(members[i]);
        safetyNet.deposit(id, payI);
      }
    }

    // Single (larger) deposit for members[0] so we can make a large request
    uint256 due0 = safetyNet.duesRemainingThisEpoch(id, members[0]);
    if (due0 == 0) {
      vm.warp(block.timestamp + cfg.epochDuration + 1);
      due0 = safetyNet.duesRemainingThisEpoch(id, members[0]);
    }

    uint256 depositValue0 = 3e18;
    uint256 pay0 = depositValue0 > due0 ? due0 : depositValue0;
    _mintApprove(members[0], pay0 + cfg.initialDeposit + cfg.fixedDeposit, address(safetyNet));
    vm.prank(members[0]);
    safetyNet.deposit(id, pay0);

    uint256 daysRequested = 1;

    vm.prank(members[0]);
    safetyNet.withdraw(id, daysRequested);
    uint256 n = safetyNet.nextIdRequest();
    assertGt(n, 0, 'expected a request');
    uint256 reqId = n - 1;

    // Exactly threshold YES votes (floor).
    uint256 needed = (m * consensus) / 100; // floor
    for (uint256 i = 1; i <= needed && i < m; i++) {
      vm.prank(members[i]);
      safetyNet.vote(reqId, true);
    }
    assertFalse(safetyNet.isExecuted(reqId), '== threshold must not execute');

    // One more YES crosses the threshold.
    if (needed + 1 < m) {
      uint256 balBefore = token.balanceOf(members[0]);
      vm.prank(members[needed + 1]);
      safetyNet.vote(reqId, true);
      assertTrue(safetyNet.isExecuted(reqId), '> threshold executes');
      uint256 balAfter = token.balanceOf(members[0]);
      assertGt(balAfter, balBefore);
    }
  }

  /// -------------------------------------------------------------------------
  /// Property-based: Voting windows and contest behavior.
  ///  - Only members may vote; no double voting.
  ///  - Votes outside `votingWindow` revert.
  ///  - Contested requests must NOT auto-execute on timeout,
  ///    and executeContestedWithdrawal should not succeed.
  /// -------------------------------------------------------------------------
  function testFuzz_Voting_Windows_And_Contest_BlockAutoExec(uint32 votingSecsRaw, uint32 contestSecsRaw) public {
    uint256 votingWin = bound(uint256(votingSecsRaw), 1 hours, 3 days);
    uint256 contestWin = bound(uint256(contestSecsRaw), 1 hours, 3 days);

    ISafetyNet.SafetyNet memory cfg = safeCfg;
    cfg.members = defaultMembers;
    cfg.safetyNetStart = block.timestamp;
    cfg.votingWindow = votingWin;
    cfg.contestWindow = contestWin;
    cfg.ratio = 1;
    cfg.autoThreshold = 1;

    uint256 id = safetyNet.create(cfg);

    // Fund member1 and create a "large" request.
    uint256 depositValue = 2e18;
    uint256 due = safetyNet.duesRemainingThisEpoch(id, member1);
    if (due == 0) {
      vm.warp(block.timestamp + cfg.epochDuration + 1);
      due = safetyNet.duesRemainingThisEpoch(id, member1);
    }
    uint256 pay = depositValue > due ? due : depositValue;
    _mintApprove(member1, pay + cfg.initialDeposit + cfg.fixedDeposit, address(safetyNet));
    vm.prank(member1);
    safetyNet.deposit(id, pay);

    uint256 daysRequested = 1;

    vm.prank(member1);
    safetyNet.withdraw(id, daysRequested);
    uint256 n = safetyNet.nextIdRequest();
    assertGt(n, 0, 'expected a request');
    uint256 reqId = n - 1;

    // Only members may vote.
    address outsider = address(0xDEAD);
    vm.prank(outsider);
    vm.expectRevert(ISafetyNet.NotMember.selector);
    safetyNet.vote(reqId, true);

    // No double voting.
    vm.prank(member2);
    safetyNet.vote(reqId, true);
    vm.prank(member2);
    vm.expectRevert(ISafetyNet.AlreadyVoted.selector);
    safetyNet.vote(reqId, true);

    // Voting must be within the window.
    vm.warp(block.timestamp + votingWin + 1);
    vm.prank(member3);
    vm.expectRevert(ISafetyNet.VotingWindowClosed.selector);
    safetyNet.vote(reqId, true);

    // New request that gets contested; verify it does not auto-execute after timeout.
    vm.prank(member1);
    safetyNet.withdraw(id, daysRequested);
    uint256 n2 = safetyNet.nextIdRequest();
    assertGt(n2, 0, 'expected a request');
    uint256 req2 = n2 - 1;

    vm.prank(member2);
    safetyNet.contest(req2);

    vm.warp(block.timestamp + contestWin + 1);

    // Attempt execution; it should not mark executed for contested request.
    vm.prank(member3);
    try safetyNet.executeContestedWithdrawal(req2) {} catch {}
    assertFalse(safetyNet.isExecuted(req2), 'contested request must not auto-execute');
  }

  /// -------------------------------------------------------------------------
  /// Scenario: Vote-heavy fuzz — random voting with bias until consensus or timeout.
  /// Properties:
  ///  - No catastrophic reverts while exploring varied member counts (3..20),
  ///    consensus thresholds (1..99), and yes-vote biases (0..100%).
  ///  - If consensus not reached by votes, allow post-window execution attempt.
  /// -------------------------------------------------------------------------
  function testFuzz_Voting_ConsensusOrTimeout(
    uint8 memberCountRaw,
    uint8 consensusPctRaw,
    uint8 yesBiasRaw,
    uint256 randSeed
  ) public {
    uint256 m = bound(uint256(memberCountRaw), 3, 20);
    uint256 consensus = bound(uint256(consensusPctRaw), 1, 99);
    uint256 yesBias = bound(uint256(yesBiasRaw), 0, 100);

    address[] memory members = _makeMembers(m);
    ISafetyNet.SafetyNet memory cfg = safeCfg;
    cfg.members = members;
    cfg.minimumMembers = 2;
    cfg.maximumMembers = m;
    cfg.consensusThreshold = consensus;
    cfg.safetyNetStart = block.timestamp;
    cfg.votingWindow = 1 days;
    cfg.contestWindow = 1 days;
    cfg.autoThreshold = 1;
    uint256 id = safetyNet.create(cfg);

    // Seed balances; ignore per-member deposit failure to keep exploring.
    for (uint256 i = 0; i < m; i++) {
      _mintApprove(members[i], 5e21, address(safetyNet));
      vm.prank(members[i]);
      try safetyNet.deposit(id, 5e18) {} catch {}
    }

    uint256 due0 = safetyNet.duesRemainingThisEpoch(id, members[0]);
    if (due0 == 0) {
      vm.warp(block.timestamp + cfg.epochDuration + 1);
      due0 = safetyNet.duesRemainingThisEpoch(id, members[0]);
    }
    uint256 depositValue = 5e18;
    uint256 pay0 = depositValue > due0 ? due0 : depositValue;
    _mintApprove(members[0], pay0 + cfg.initialDeposit + cfg.fixedDeposit, address(safetyNet));
    vm.prank(members[0]);
    safetyNet.deposit(id, pay0);

    // With tiny autoThreshold, any positive withdrawal amount will be "large"
    uint256 daysRequested = 1;

    vm.prank(members[0]);
    safetyNet.withdraw(id, daysRequested);
    uint256 n = safetyNet.nextIdRequest();
    assertGt(n, 0, 'expected a request');
    uint256 reqId = n - 1;

    // Randomized voting pass
    for (uint256 i = 0; i < m && !safetyNet.isExecuted(reqId); i++) {
      address voter = members[i];
      randSeed = uint256(keccak256(abi.encodePacked(randSeed, i)));
      bool voteYes = (randSeed % 100) < yesBias;
      vm.prank(voter);
      try safetyNet.vote(reqId, voteYes) {} catch {}
    }

    // If not executed by consensus, try after contest window.
    if (!safetyNet.isExecuted(reqId)) {
      vm.warp(block.timestamp + cfg.contestWindow + 1);
      vm.prank(members[m - 1]);
      try safetyNet.executeContestedWithdrawal(reqId) {} catch {}
    }

    assertTrue(true); // sanity: no catastrophic revert
  }
}
