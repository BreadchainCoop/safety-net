// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafetyNetFuzzBase} from './SafetyNetFuzzBase.t.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

contract SafetyNetFuzz_RequestsContesting is SafetyNetFuzzBase {
  /// -------------------------------------------------------------------------
  /// Scenario: Large withdrawal request followed by auto-execution after contest window.
  /// Properties:
  ///  - Request is created for > autoThreshold.
  ///  - No one contests the request.
  ///  - After contest window elapses, an execution call succeeds.
  ///  - Beneficiary's balance increases; request marked executed.
  /// -------------------------------------------------------------------------
  function testFuzz_LargeWithdrawal_RequestAndAutoExecute(uint256 depositValueRaw, uint8 extraDaysRaw) public {
    uint256 depositValue = bound(depositValueRaw, 5e18, 1e22);

    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.redeemRatio = 1;
    config.autoThreshold = 1;
    uint256 safetyNetId = _createStarted(config, _defaultMembers);

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

    // Warp beyond contest window
    vm.warp(block.timestamp + config.contestWindow + 1);

    // Ensure it is not vetoed
    assertFalse(_safetyNet.isVetoed(requestId));

    uint256 balanceBefore = _token.balanceOf(_member1);
    vm.prank(_member2);
    _safetyNet.executeContestedWithdrawal(requestId);
    uint256 balanceAfter = _token.balanceOf(_member1);

    assertGt(balanceAfter, balanceBefore);
    assertTrue(_safetyNet.isExecuted(requestId));
  }

  /// -------------------------------------------------------------------------
  /// Property-based: Contest threshold boundary.
  /// For memberCount members and threshold T%, exactly floor(memberCount*T/100)
  /// contests must NOT trigger a veto; strictly more than that must trigger it.
  /// -------------------------------------------------------------------------
  function testFuzz_Contest_ThresholdBoundary(uint8 membersRaw, uint8 contestPctRaw) public {
    uint256 memberCount = bound(uint256(membersRaw), 3, 20);
    uint256 threshold = bound(uint256(contestPctRaw), 1, 99);

    address[] memory members = _makeMembers(memberCount);

    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.minimumMembers = 2;
    config.maximumMembers = memberCount;
    config.contestThreshold = threshold;
    config.autoThreshold = 1;
    config.contestWindow = 7 days;

    uint256 safetyNetId = _createStarted(config, members);

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

    // Exactly threshold contests (floor).
    uint256 needed = (memberCount * threshold) / 100; // floor
    for (uint256 i = 1; i <= needed && i < memberCount; i++) {
      vm.prank(members[i]);
      _safetyNet.contest(requestId);
    }

    assertFalse(_safetyNet.isVetoed(requestId), '== threshold must not trigger veto');

    // One more contest crosses the threshold.
    if (needed + 1 < memberCount) {
      vm.prank(members[needed + 1]);
      _safetyNet.contest(requestId);
      assertTrue(_safetyNet.isVetoed(requestId), '> threshold must trigger veto');

      // Attempting execution should fail silently because it is vetoed
      vm.warp(block.timestamp + config.contestWindow + 1);
      vm.prank(members[needed + 1]);
      _safetyNet.executeContestedWithdrawal(requestId);
      assertFalse(_safetyNet.isExecuted(requestId), 'Vetoed request must not be executed');
    }
  }

  /// -------------------------------------------------------------------------
  /// Property-based: Contest behavior.
  ///  - No double contesting (Sybil Resistance).
  ///  - Contests outside `contestWindow` revert.
  ///  - Contested requests (Vetoed) must NOT auto-execute on timeout.
  /// -------------------------------------------------------------------------
  function testFuzz_Contest_SybilAndTimeout(uint32 contestSecsRaw) public {
    uint256 contestWin = bound(uint256(contestSecsRaw), 1 hours, 3 days);

    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.contestWindow = contestWin;
    config.redeemRatio = 1;
    config.autoThreshold = 1;
    config.contestThreshold = 34;

    uint256 safetyNetId = _createStarted(config, _defaultMembers);

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

    // No double contesting (Sybil Attack)
    vm.prank(_member2);
    _safetyNet.contest(requestId);
    vm.prank(_member2);
    vm.expectRevert(ISafetyNet.AlreadyContestedByMember.selector);
    _safetyNet.contest(requestId);

    // Contesting must be within the window.
    vm.warp(block.timestamp + contestWin + 1);
    vm.prank(_member3);
    vm.expectRevert(ISafetyNet.ContestWindowClosed.selector);
    _safetyNet.contest(requestId);

    // New request that gets vetoed; verify it does not execute after its own timeout.
    vm.prank(_member1);
    _safetyNet.withdraw(safetyNetId, daysRequested);
    uint256 n2 = _safetyNet.nextIdRequest();
    uint256 req2 = n2 - 1;

    // Trigger Veto (2 out of 3 members contest) within the contest window.
    vm.prank(_member2);
    _safetyNet.contest(req2);
    vm.prank(_member3);
    _safetyNet.contest(req2);

    assertTrue(_safetyNet.isVetoed(req2), 'Request should be vetoed');

    vm.warp(block.timestamp + contestWin + 1);

    // Attempt execution; it should not mark executed for vetoed request.
    vm.prank(_member3);
    _safetyNet.executeContestedWithdrawal(req2);
    assertFalse(_safetyNet.isExecuted(req2), 'vetoed request must not auto-execute');
  }
}
