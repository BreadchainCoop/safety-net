// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafetyNetFuzzBase} from './SafetyNetFuzzBase.t.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';
import {MockERC20} from 'test/mocks/MockERC20.sol';

contract SafetyNetFuzz_Create is SafetyNetFuzzBase {
  function testFuzz_LotsOfSafetyNetCreations(uint8 nRaw, uint8 consensusBase) public {
    uint256 n = bound(uint256(nRaw), 5, 50);
    uint256 cBase = 30 + (uint256(consensusBase) % 40);

    uint256 success;

    for (uint256 i = 0; i < n; i++) {
      ISafetyNet.SafetyNet memory cfg = safeCfg;
      cfg.safetyNetStart = block.timestamp + 1;
      cfg.consensusThreshold = uint256((cBase + i) % 100);
      if (cfg.consensusThreshold < 1) cfg.consensusThreshold = 1;
      cfg.autoThreshold = SAFE_AUTO_THRESHOLD + i * 1e15;
      cfg.members = _threeMembers();

      uint256 id = safetyNet.create(cfg);
      assertEq(id, success, 'id matches successes so far');
      success++;
    }

    assertEq(safetyNet.nextId(), success, 'nextId equals the number of successful creations');
  }

  function test_Create_RevertsOnZeroAddressMember() public {
    ISafetyNet.SafetyNet memory cfg = safeCfg;
    cfg.safetyNetStart = block.timestamp + 1;
    cfg.members = _threeMembers();
    cfg.members[0] = address(0);

    vm.expectRevert(ISafetyNet.InvalidMemberAddress.selector);
    safetyNet.create(cfg);
  }

  function test_Create_RevertsOnDisallowedToken_then_SucceedsWhenAllowed() public {
    ISafetyNet.SafetyNet memory cfg = safeCfg;
    cfg.safetyNetStart = block.timestamp + 1;

    MockERC20 tmp = new MockERC20('Tmp', 'TMP');
    cfg.token = address(tmp);

    vm.expectRevert(ISafetyNet.TokenNotAllowed.selector);
    safetyNet.create(cfg);

    safetyNet.setTokenAllowed(address(tmp), true);
    uint256 idAllowed = safetyNet.create(cfg);
    assertEq(idAllowed, 0, 'first successful creation gets id 0');
  }
}
