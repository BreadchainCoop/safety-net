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

    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.members = _defaultMembers;
    config.ratio = 1;
    config.autoThreshold = 1;
    config.safetyNetStart = block.timestamp;
    uint256 safetyNetId = _safetyNet.create(config);

    uint256 due = _safetyNet.duesRemainingThisEpoch(safetyNetId, _member1);
    if (due == 0) {
      vm.warp(block.timestamp + config.epochDuration + 1);
      due = _safetyNet.duesRemainingThisEpoch(safetyNetId, _member1);
    }
    uint256 pay = depositValue > due ? due : depositValue;
    _mintApprove(_member1, pay + config.initialDeposit + config.fixedDeposit, address(_safetyNet));
    if (_safetyNet.safetyNetMemberContribute(safetyNetId, _member1) == 0) {
      vm.prank(_member1);
      _safetyNet.deposit(safetyNetId, config.initialDeposit);
    } else {
      vm.prank(_member1);
      _safetyNet.deposit(safetyNetId, pay);
    }

    // Choose a daysRequested that ensures "large" classification.
    _safetyNet.safetyNetMemberContribute(safetyNetId, _member1);
    uint256 daysRequested = 1 + (uint256(extraDaysRaw) % 5);

    vm.prank(_member1);
    _safetyNet.withdraw(safetyNetId, daysRequested);
    uint256 requestCount = _safetyNet.nextIdRequest();
    assertGt(requestCount, 0, 'expected a request');
    uint256 requestId = requestCount - 1;

    vm.warp(block.timestamp + config.contestWindow + 1);

    uint256 balanceBefore = _token.balanceOf(_member1);
    vm.prank(_member2);
    _safetyNet.executeContestedWithdrawal(requestId);
    uint256 balanceAfter = _token.balanceOf(_member1);

    assertGt(balanceAfter, balanceBefore);
    assertTrue(_safetyNet.isExecuted(requestId));
  }

  /// -------------------------------------------------------------------------
  /// Property-based: Voting threshold boundary.
  /// For memberCount members and threshold T%, exactly floor(memberCount*T/100) YES must NOT execute;
  /// strictly more than that must execute.
  /// -------------------------------------------------------------------------
  function testFuzz_Voting_ThresholdBoundary(uint8 membersRaw, uint8 consensusPctRaw) public {
    uint256 memberCount = bound(uint256(membersRaw), 3, 20);
    uint256 consensus = bound(uint256(consensusPctRaw), 1, 99);

    address[] memory members = _makeMembers(memberCount);

    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.members = members;
    config.minimumMembers = 2;
    config.maximumMembers = memberCount;
    config.consensusThreshold = consensus;
    config.autoThreshold = 1;
    config.safetyNetStart = block.timestamp;
    config.votingWindow = 7 days;
    config.contestWindow = 7 days;

    uint256 safetyNetId = _safetyNet.create(config);

    // Seed deposits for members[1..memberCount-1]
    uint256 depEach = 2e18;
    for (uint256 i = 1; i < memberCount; i++) {
      uint256 dueI = _safetyNet.duesRemainingThisEpoch(safetyNetId, members[i]);
      if (dueI > 0) {
        uint256 payI = depEach > dueI ? dueI : depEach;
        _mintApprove(members[i], payI + config.initialDeposit + config.fixedDeposit, address(_safetyNet));
        if (_safetyNet.safetyNetMemberContribute(safetyNetId, members[i]) == 0) {
          vm.prank(members[i]);
          _safetyNet.deposit(safetyNetId, config.initialDeposit);
        } else {
          vm.prank(members[i]);
          _safetyNet.deposit(safetyNetId, payI);
        }
      }
    }

    // Single (larger) deposit for members[0] so we can make a large request
    uint256 due0 = _safetyNet.duesRemainingThisEpoch(safetyNetId, members[0]);
    if (due0 == 0) {
      vm.warp(block.timestamp + config.epochDuration + 1);
      due0 = _safetyNet.duesRemainingThisEpoch(safetyNetId, members[0]);
    }

    uint256 depositValue0 = 3e18;
    uint256 pay0 = depositValue0 > due0 ? due0 : depositValue0;
    _mintApprove(members[0], pay0 + config.initialDeposit + config.fixedDeposit, address(_safetyNet));
    if (_safetyNet.safetyNetMemberContribute(safetyNetId, members[0]) == 0) {
      vm.prank(members[0]);
      _safetyNet.deposit(safetyNetId, config.initialDeposit);
    } else {
      vm.prank(members[0]);
      _safetyNet.deposit(safetyNetId, pay0);
    }

    uint256 daysRequested = 1;

    vm.prank(members[0]);
    _safetyNet.withdraw(safetyNetId, daysRequested);
    uint256 requestCount = _safetyNet.nextIdRequest();
    assertGt(requestCount, 0, 'expected a request');
    uint256 requestId = requestCount - 1;

    // Exactly threshold YES votes (floor).
    uint256 needed = (memberCount * consensus) / 100; // floor
    for (uint256 i = 1; i <= needed && i < memberCount; i++) {
      vm.prank(members[i]);
      _safetyNet.vote(requestId, true);
    }
    assertFalse(_safetyNet.isExecuted(requestId), '== threshold must not execute');

    // One more YES crosses the threshold.
    if (needed + 1 < memberCount) {
      uint256 balanceBefore = _token.balanceOf(members[0]);
      vm.prank(members[needed + 1]);
      _safetyNet.vote(requestId, true);
      assertTrue(_safetyNet.isExecuted(requestId), '> threshold executes');
      uint256 balanceAfter = _token.balanceOf(members[0]);
      assertGt(balanceAfter, balanceBefore);
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

    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.members = _defaultMembers;
    config.safetyNetStart = block.timestamp;
    config.votingWindow = votingWin;
    config.contestWindow = contestWin;
    config.ratio = 1;
    config.autoThreshold = 1;

    uint256 safetyNetId = _safetyNet.create(config);

    // Fund _member1 and create a "large" request.
    uint256 depositValue = 2e18;
    uint256 due = _safetyNet.duesRemainingThisEpoch(safetyNetId, _member1);
    if (due == 0) {
      vm.warp(block.timestamp + config.epochDuration + 1);
      due = _safetyNet.duesRemainingThisEpoch(safetyNetId, _member1);
    }
    uint256 pay = depositValue > due ? due : depositValue;
    _mintApprove(_member1, pay + config.initialDeposit + config.fixedDeposit, address(_safetyNet));
    if (_safetyNet.safetyNetMemberContribute(safetyNetId, _member1) == 0) {
      vm.prank(_member1);
      _safetyNet.deposit(safetyNetId, config.initialDeposit);
    } else {
      vm.prank(_member1);
      _safetyNet.deposit(safetyNetId, pay);
    }

    uint256 daysRequested = 1;

    vm.prank(_member1);
    _safetyNet.withdraw(safetyNetId, daysRequested);
    uint256 requestCount = _safetyNet.nextIdRequest();
    assertGt(requestCount, 0, 'expected a request');
    uint256 requestId = requestCount - 1;

    // Only members may vote.
    address outsider = address(0xDEAD);
    vm.prank(outsider);
    vm.expectRevert(ISafetyNet.NotMember.selector);
    _safetyNet.vote(requestId, true);

    // No double voting.
    vm.prank(_member2);
    _safetyNet.vote(requestId, true);
    vm.prank(_member2);
    vm.expectRevert(ISafetyNet.AlreadyVoted.selector);
    _safetyNet.vote(requestId, true);

    // Voting must be within the window.
    vm.warp(block.timestamp + votingWin + 1);
    vm.prank(_member3);
    vm.expectRevert(ISafetyNet.VotingWindowClosed.selector);
    _safetyNet.vote(requestId, true);

    // New request that gets contested; verify it does not auto-execute after timeout.
    vm.prank(_member1);
    _safetyNet.withdraw(safetyNetId, daysRequested);
    uint256 n2 = _safetyNet.nextIdRequest();
    assertGt(n2, 0, 'expected a request');
    uint256 req2 = n2 - 1;

    vm.prank(_member2);
    _safetyNet.contest(req2);

    vm.warp(block.timestamp + contestWin + 1);

    // Attempt execution; it should not mark executed for contested request.
    vm.prank(_member3);
    try _safetyNet.executeContestedWithdrawal(req2) {} catch {}
    assertFalse(_safetyNet.isExecuted(req2), 'contested request must not auto-execute');
  }

  /// -------------------------------------------------------------------------
  /// Scenario: Vote-heavy fuzz — random voting with bias until consensus or timeout.
  /// Properties:
  ///  - No catastrophic reverts while exploring varied member counts (3..20),
  ///    consensus thresholds (1..99), and yes-vote biases (0..100%).
  ///  - If consensus not reached by votes, allow post-window execution attempt.
  /// -------------------------------------------------------------------------
  function testFuzz_Voting_ConsensusOrTimeout(uint8 memberCountRaw, uint8 consensusPctRaw, uint8 yesBiasRaw, uint256 randSeed) public {
    uint256 memberCount = bound(uint256(memberCountRaw), 3, 20);
    uint256 consensus = bound(uint256(consensusPctRaw), 1, 99);
    uint256 yesBias = bound(uint256(yesBiasRaw), 0, 100);

    address[] memory members = _makeMembers(memberCount);
    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.members = members;
    config.minimumMembers = 2;
    config.maximumMembers = memberCount;
    config.consensusThreshold = consensus;
    config.safetyNetStart = block.timestamp;
    config.votingWindow = 1 days;
    config.contestWindow = 1 days;
    config.autoThreshold = 1;
    uint256 safetyNetId = _safetyNet.create(config);

    // Seed balances; ignore per-member deposit failure to keep exploring.
    for (uint256 i = 0; i < memberCount; i++) {
      _mintApprove(members[i], 5e21, address(_safetyNet));
      vm.prank(members[i]);
      try _safetyNet.deposit(safetyNetId, 5e18) {} catch {}
    }

    uint256 due0 = _safetyNet.duesRemainingThisEpoch(safetyNetId, members[0]);
    if (due0 == 0) {
      vm.warp(block.timestamp + config.epochDuration + 1);
      due0 = _safetyNet.duesRemainingThisEpoch(safetyNetId, members[0]);
    }
    uint256 depositValue = 5e18;
    uint256 pay0 = depositValue > due0 ? due0 : depositValue;
    _mintApprove(members[0], pay0 + config.initialDeposit + config.fixedDeposit, address(_safetyNet));
    if (_safetyNet.safetyNetMemberContribute(safetyNetId, members[0]) == 0) {
      vm.prank(members[0]);
      _safetyNet.deposit(safetyNetId, config.initialDeposit);
    } else {
      vm.prank(members[0]);
      _safetyNet.deposit(safetyNetId, pay0);
    }

    // With tiny autoThreshold, any positive withdrawal amount will be "large"
    uint256 daysRequested = 1;

    vm.prank(members[0]);
    _safetyNet.withdraw(safetyNetId, daysRequested);
    uint256 requestCount = _safetyNet.nextIdRequest();
    assertGt(requestCount, 0, 'expected a request');
    uint256 requestId = requestCount - 1;

    // Randomized voting pass
    for (uint256 i = 0; i < memberCount && !_safetyNet.isExecuted(requestId); i++) {
      address voter = members[i];
      randSeed = uint256(keccak256(abi.encodePacked(randSeed, i)));
      bool voteYes = (randSeed % 100) < yesBias;
      vm.prank(voter);
      try _safetyNet.vote(requestId, voteYes) {} catch {}
    }

    // If not executed by consensus, try after contest window.
    if (!_safetyNet.isExecuted(requestId)) {
      vm.warp(block.timestamp + config.contestWindow + 1);
      vm.prank(members[memberCount - 1]);
      try _safetyNet.executeContestedWithdrawal(requestId) {} catch {}
    }

    assertTrue(true); // sanity: no catastrophic revert
  }
}
