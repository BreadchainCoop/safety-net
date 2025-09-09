// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;



import {BreadfundFuzzBase} from "./BreadfundFuzzBase.t.sol";
import {IBreadfund} from "src/interfaces/IBreadfund.sol";

contract BreadfundFuzz_VariableMembers is BreadfundFuzzBase {
  /// -------------------------------------------------------------------------
  /// Fuzz: deposits across epochs for variable members.
  /// -------------------------------------------------------------------------
  function testFuzz_Deposits_AcrossEpochs(
    uint8 membersRaw, uint8 epochsRaw, uint8 opsRaw, uint256 seed
  ) public {
    uint256 m      = bound(uint256(membersRaw), 3, 25);
    uint256 epochs = bound(uint256(epochsRaw),  2, 8);
    uint256 ops    = bound(uint256(opsRaw),     5, 30);

    address[] memory members = _makeMembers(m);
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = members;
    cfg.minimumMembers = 2;
    cfg.maximumMembers = m;
    cfg.breadfundStart = block.timestamp;
    cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    for (uint256 i = 0; i < m; i++) {
      _mintApprove(members[i], 1e24, address(breadfund));
    }

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = members[seed % m];
        uint256 v = 1e18 + (seed % 1e18);
        vm.prank(actor);
        try breadfund.deposit(id, v) {} catch {}
      }
      vm.warp(block.timestamp + cfg.epochDuration + 1);
    }
  }

  /// -------------------------------------------------------------------------
  /// Fuzz: small withdrawals (1–3 days) across epochs.
  /// -------------------------------------------------------------------------
  function testFuzz_SmallWithdraws_AcrossEpochs(
    uint8 membersRaw, uint8 epochsRaw, uint8 opsRaw, uint256 seed
  ) public {
    uint256 m      = bound(uint256(membersRaw), 3, 25);
    uint256 epochs = bound(uint256(epochsRaw),  2, 8);
    uint256 ops    = bound(uint256(opsRaw),     5, 30);

    address[] memory members = _makeMembers(m);
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = members;
    cfg.minimumMembers = 2;
    cfg.maximumMembers = m;
    cfg.breadfundStart = block.timestamp;
    cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    for (uint256 i = 0; i < m; i++) {
      _mintApprove(members[i], 1e24, address(breadfund));
      vm.prank(members[i]);
      try breadfund.deposit(id, 5e18) {} catch {}
    }

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = members[seed % m];
        uint256 daysReq = 1 + (seed % 3);
        vm.prank(actor);
        try breadfund.withdraw(id, daysReq) {} catch {}
      }
      vm.warp(block.timestamp + cfg.epochDuration + 1);
    }
  }

  /// -------------------------------------------------------------------------
  /// Fuzz: large withdrawals (40–79 days) that may create requests.
  /// -------------------------------------------------------------------------
  function testFuzz_LargeWithdraws_CreateRequests(
    uint8 membersRaw, uint8 epochsRaw, uint8 opsRaw, uint256 seed
  ) public {
    uint256 m      = bound(uint256(membersRaw), 3, 25);
    uint256 epochs = bound(uint256(epochsRaw),  2, 8);
    uint256 ops    = bound(uint256(opsRaw),     5, 30);

    address[] memory members = _makeMembers(m);
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = members;
    cfg.minimumMembers = 2;
    cfg.maximumMembers = m;
    cfg.breadfundStart = block.timestamp;
    cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    for (uint256 i = 0; i < m; i++) {
      _mintApprove(members[i], 1e24, address(breadfund));
      vm.prank(members[i]);
      try breadfund.deposit(id, 1e19) {} catch {}
    }

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = members[seed % m];
        uint256 daysReq = 40 + (seed % 40);
        vm.prank(actor);
        try breadfund.withdraw(id, daysReq) {} catch {}
      }
      vm.warp(block.timestamp + cfg.epochDuration + 1);
    }
  }

  /// -------------------------------------------------------------------------
  /// Fuzz: execute the latest request after contest window.
  /// -------------------------------------------------------------------------
  function testFuzz_ExecuteLatestRequest_WhenWindowElapsed(
    uint8 membersRaw, uint8 epochsRaw, uint8 opsRaw, uint256 seed
  ) public {
    uint256 m      = bound(uint256(membersRaw), 3, 25);
    uint256 epochs = bound(uint256(epochsRaw),  2, 8);
    uint256 ops    = bound(uint256(opsRaw),     5, 30);

    address[] memory members = _makeMembers(m);
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = members;
    cfg.minimumMembers = 2;
    cfg.maximumMembers = m;
    cfg.breadfundStart = block.timestamp;
    cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    for (uint256 i = 0; i < m; i++) {
      _mintApprove(members[i], 1e24, address(breadfund));
      vm.prank(members[i]);
      try breadfund.deposit(id, 1e19) {} catch {}
    }

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = members[seed % m];

        // Create a large withdraw request occasionally.
        uint256 daysReq = 40 + (seed % 40);
        vm.prank(actor);
        try breadfund.withdraw(id, daysReq) {} catch {}

        // If a request exists, occasionally fast-forward past contest window and execute.
        if (breadfund.nextIdRequest() > 0 && (seed & 1) == 1) {
          uint256 reqId = breadfund.nextIdRequest() - 1;
          vm.warp(block.timestamp + cfg.contestWindow + 1);
          vm.prank(actor);
          try breadfund.executeContestedWithdrawal(reqId) {} catch {}
        }
      }
      vm.warp(block.timestamp + cfg.epochDuration + 1);
    }
  }
}
