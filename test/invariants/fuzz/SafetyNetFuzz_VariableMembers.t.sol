// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafetyNetFuzzBase} from './SafetyNetFuzzBase.t.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

contract SafetyNetFuzz_VariableMembers is SafetyNetFuzzBase {
  /// -------------------------------------------------------------------------
  /// Fuzz: deposits across epochs for variable members.
  /// -------------------------------------------------------------------------
  function testFuzz_Deposits_AcrossEpochs(uint8 membersRaw, uint8 epochsRaw, uint8 opsRaw, uint256 seed) public {
    uint256 memberCount = bound(uint256(membersRaw), 3, 25);
    uint256 epochs = bound(uint256(epochsRaw), 2, 8);
    uint256 ops = bound(uint256(opsRaw), 5, 30);

    address[] memory members = _makeMembers(memberCount);
    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.members = members;
    config.minimumMembers = 2;
    config.maximumMembers = memberCount;
    config.safetyNetStart = block.timestamp;
    config.ratio = 1;
    uint256 safetyNetId = _safetyNet.create(config);

    for (uint256 i = 0; i < memberCount; i++) {
      _mintApprove(members[i], 1e24, address(_safetyNet));
    }

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = members[seed % memberCount];
        uint256 v = 1e18 + (seed % 1e18);
        vm.prank(actor);
        try _safetyNet.deposit(safetyNetId, v) {} catch {}
      }
      vm.warp(block.timestamp + config.epochDuration + 1);
    }
  }

  /// -------------------------------------------------------------------------
  /// Fuzz: small withdrawals (1–3 days) across epochs.
  /// -------------------------------------------------------------------------
  function testFuzz_SmallWithdraws_AcrossEpochs(uint8 membersRaw, uint8 epochsRaw, uint8 opsRaw, uint256 seed) public {
    uint256 memberCount = bound(uint256(membersRaw), 3, 25);
    uint256 epochs = bound(uint256(epochsRaw), 2, 8);
    uint256 ops = bound(uint256(opsRaw), 5, 30);

    address[] memory members = _makeMembers(memberCount);
    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.members = members;
    config.minimumMembers = 2;
    config.maximumMembers = memberCount;
    config.safetyNetStart = block.timestamp;
    config.ratio = 1;
    uint256 safetyNetId = _safetyNet.create(config);

    for (uint256 i = 0; i < memberCount; i++) {
      _mintApprove(members[i], 1e24, address(_safetyNet));
      vm.prank(members[i]);
      try _safetyNet.deposit(safetyNetId, 5e18) {} catch {}
    }

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = members[seed % memberCount];
        uint256 daysReq = 1 + (seed % 3);
        vm.prank(actor);
        try _safetyNet.withdraw(safetyNetId, daysReq) {} catch {}
      }
      vm.warp(block.timestamp + config.epochDuration + 1);
    }
  }

  /// -------------------------------------------------------------------------
  /// Fuzz: large withdrawals (40–79 days) that may create requests.
  /// -------------------------------------------------------------------------
  function testFuzz_LargeWithdraws_CreateRequests(uint8 membersRaw, uint8 epochsRaw, uint8 opsRaw, uint256 seed) public {
    uint256 memberCount = bound(uint256(membersRaw), 3, 25);
    uint256 epochs = bound(uint256(epochsRaw), 2, 8);
    uint256 ops = bound(uint256(opsRaw), 5, 30);

    address[] memory members = _makeMembers(memberCount);
    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.members = members;
    config.minimumMembers = 2;
    config.maximumMembers = memberCount;
    config.safetyNetStart = block.timestamp;
    config.ratio = 1;
    uint256 safetyNetId = _safetyNet.create(config);

    for (uint256 i = 0; i < memberCount; i++) {
      _mintApprove(members[i], 1e24, address(_safetyNet));
      vm.prank(members[i]);
      try _safetyNet.deposit(safetyNetId, 1e19) {} catch {}
    }

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = members[seed % memberCount];
        uint256 daysReq = 40 + (seed % 40);
        vm.prank(actor);
        try _safetyNet.withdraw(safetyNetId, daysReq) {} catch {}
      }
      vm.warp(block.timestamp + config.epochDuration + 1);
    }
  }

  /// -------------------------------------------------------------------------
  /// Fuzz: execute the latest request after contest window.
  /// -------------------------------------------------------------------------
  function testFuzz_ExecuteLatestRequest_WhenWindowElapsed(uint8 membersRaw, uint8 epochsRaw, uint8 opsRaw, uint256 seed) public {
    uint256 memberCount = bound(uint256(membersRaw), 3, 25);
    uint256 epochs = bound(uint256(epochsRaw), 2, 8);
    uint256 ops = bound(uint256(opsRaw), 5, 30);

    address[] memory members = _makeMembers(memberCount);
    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.members = members;
    config.minimumMembers = 2;
    config.maximumMembers = memberCount;
    config.safetyNetStart = block.timestamp;
    config.ratio = 1;
    uint256 safetyNetId = _safetyNet.create(config);

    for (uint256 i = 0; i < memberCount; i++) {
      _mintApprove(members[i], 1e24, address(_safetyNet));
      vm.prank(members[i]);
      try _safetyNet.deposit(safetyNetId, 1e19) {} catch {}
    }

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = members[seed % memberCount];

        // Create a large withdraw request occasionally.
        uint256 daysReq = 40 + (seed % 40);
        vm.prank(actor);
        try _safetyNet.withdraw(safetyNetId, daysReq) {} catch {}

        // If a request exists, occasionally fast-forward past contest window and execute.
        if (_safetyNet.nextIdRequest() > 0 && (seed & 1) == 1) {
          uint256 reqId = _safetyNet.nextIdRequest() - 1;
          vm.warp(block.timestamp + config.contestWindow + 1);
          vm.prank(actor);
          try _safetyNet.executeContestedWithdrawal(reqId) {} catch {}
        }
      }
      vm.warp(block.timestamp + config.epochDuration + 1);
    }
  }
}
