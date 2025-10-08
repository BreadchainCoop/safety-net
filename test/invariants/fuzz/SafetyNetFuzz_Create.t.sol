// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafetyNetFuzzBase} from './SafetyNetFuzzBase.t.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';
import {MockERC20} from 'test/mocks/MockERC20.sol';

contract SafetyNetFuzz_Create is SafetyNetFuzzBase {
  function testFuzz_LotsOfSafetyNetCreations(uint8 safetyNetCountRaw, uint8 consensusBase) public {
    uint256 safetyNetCount = bound(uint256(safetyNetCountRaw), 5, 50);
    uint256 consensusBasePercentage = 30 + (uint256(consensusBase) % 40);

    uint256 successfulCreations;

    for (uint256 i = 0; i < safetyNetCount; i++) {
      ISafetyNet.SafetyNet memory config = _safeCfg;
      config.safetyNetStart = block.timestamp + 1;
      config.consensusThreshold = uint256((consensusBasePercentage + i) % 100);
      if (config.consensusThreshold < 1) config.consensusThreshold = 1;
      config.autoThreshold = _SAFE_AUTO_THRESHOLD + i * 1e15;
      config.members = _threeMembers();

      uint256 safetyNetId = _safetyNet.create(config);
      assertEq(safetyNetId, successfulCreations, 'safetyNetId matches successes so far');
      successfulCreations++;
    }

    assertEq(_safetyNet.nextId(), successfulCreations, 'nextId equals the number of successful creations');
  }

  function test_Create_RevertsOnZeroAddressMember() public {
    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.safetyNetStart = block.timestamp + 1;
    config.members = _threeMembers();
    config.members[0] = address(0);

    vm.expectRevert(ISafetyNet.InvalidMemberAddress.selector);
    _safetyNet.create(config);
  }

  function test_Create_RevertsOnDisallowedToken_then_SucceedsWhenAllowed() public {
    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.safetyNetStart = block.timestamp + 1;

    MockERC20 temporaryToken = new MockERC20('Tmp', 'TMP');
    config.token = address(temporaryToken);

    vm.expectRevert(ISafetyNet.TokenNotAllowed.selector);
    _safetyNet.create(config);

    _safetyNet.setTokenAllowed(address(temporaryToken), true);
    uint256 allowedSafetyNetId = _safetyNet.create(config);
    assertEq(allowedSafetyNetId, 0, 'first successful creation gets id 0');
  }
}
