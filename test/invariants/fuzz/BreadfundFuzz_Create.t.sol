// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;


import {BreadfundFuzzBase} from "./BreadfundFuzzBase.t.sol";
import {IBreadfund} from "src/interfaces/IBreadfund.sol";
import {MockERC20} from "test/mocks/MockERC20.sol";

contract BreadfundFuzz_Create is BreadfundFuzzBase {
  function testFuzz_LotsOfBreadfundCreations(uint8 nRaw, uint8 consensusBase) public {
    uint256 n = bound(uint256(nRaw), 5, 50);
    uint256 cBase = 30 + (uint256(consensusBase) % 40);

    uint256 success;

    for (uint256 i = 0; i < n; i++) {
      IBreadfund.Breadfund memory cfg = safeCfg;
      cfg.breadfundStart = block.timestamp + 1;
      cfg.consensusThreshold = uint256((cBase + i) % 100);
      if (cfg.consensusThreshold < 1) cfg.consensusThreshold = 1;
      cfg.autoThreshold = SAFE_AUTO_THRESHOLD + i * 1e15;
      cfg.members = _threeMembers();

      uint256 id = breadfund.create(cfg);
      assertEq(id, success, "id matches successes so far");
      success++;
    }

    assertEq(breadfund.nextId(), success, "nextId equals the number of successful creations");
  }

  function test_Create_RevertsOnZeroAddressMember() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.breadfundStart = block.timestamp + 1;
    cfg.members = _threeMembers();
    cfg.members[0] = address(0);

    vm.expectRevert(IBreadfund.InvalidMemberAddress.selector);
    breadfund.create(cfg);
  }

  function test_Create_RevertsOnDisallowedToken_then_SucceedsWhenAllowed() public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.breadfundStart = block.timestamp + 1;

    MockERC20 tmp = new MockERC20("Tmp", "TMP");
    cfg.token = address(tmp);

    vm.expectRevert(IBreadfund.TokenNotAllowed.selector);
    breadfund.create(cfg);

    breadfund.setTokenAllowed(address(tmp), true);
    uint256 idAllowed = breadfund.create(cfg);
    assertEq(idAllowed, 0, "first successful creation gets id 0");
  }
}