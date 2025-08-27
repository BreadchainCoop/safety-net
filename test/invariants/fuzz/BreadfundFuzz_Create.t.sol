// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * BreadfundFuzz_Create.t.sol
 *
 * Purpose: Stress the Breadfund creation surface with varied consensus thresholds,
 * auto-thresholds, member lists, and token allow-list status. Verifies monotonic
 * ID assignment and expected reverts for invalid inputs.
 *
 * Conventions:
 * - Keep asserts property-oriented (ID monotonicity, revert when token disallowed
 *   or member is zero address), not value-by-value state mirroring.
 * - Comments note which checks should flip after future spec changes.
 * ────────────────────────────────────────────────────────────────────────────────
 */

import {BreadfundFuzzBase} from "./BreadfundFuzzBase.t.sol";
import {IBreadfund} from "src/interfaces/IBreadfund.sol";
import {MockERC20} from "test/mocks/MockERC20.sol";

contract BreadfundFuzz_Create is BreadfundFuzzBase {
  /// -------------------------------------------------------------------------
  /// Scenario: Create many Breadfunds with varied consensus thresholds (30..69),
  ///           shifting autoThresholds, and occasional invalid inputs.
  /// Properties:
  ///  - Monotonic IDs: each successful `create` returns the next sequential id.
  ///  - Invalid member (zero address) → revert.
  ///  - Disallowed token → revert; after allow-listing, creation succeeds.
  /// Notes:
  ///  - If/when stricter consensus bounds are enforced (e.g., [1..99]), update
  ///    or extend the revert expectations accordingly.
  /// -------------------------------------------------------------------------
  function testFuzz_LotsOfBreadfundCreations(uint8 nRaw, uint8 consensusBase) public {
    uint256 n = bound(uint256(nRaw), 5, 50);            // 5..50 iterations
    uint256 cBase = 30 + (uint256(consensusBase) % 40); // 30..69 → varied

    uint256 success;

    for (uint256 i = 0; i < n; i++) {
      IBreadfund.Breadfund memory cfg = safeCfg;
      cfg.breadfundStart = block.timestamp + 1;
      cfg.consensusThreshold = uint256((cBase + i) % 100);
      if (cfg.consensusThreshold < 1) cfg.consensusThreshold = 1; // enforce lower bound in test input
      cfg.autoThreshold = SAFE_AUTO_THRESHOLD + i * 1e15;         // drift to vary scenarios
      cfg.members = _threeMembers();

      // Every 5th: zero-address member should cause a revert on create.
      // When spec defines the exact error, replace with the specific selector:
      //   vm.expectRevert(IBreadfund.InvalidMemberAddress.selector);
      if (i % 5 == 0) {
        cfg.members[0] = address(0);
        vm.expectRevert(); // IBreadfund.InvalidMemberAddress.selector (if used)
        breadfund.create(cfg);
        continue;
      }

      // Every 9th: token not allowed → revert; then allow and retry (should succeed).
      // When spec defines the exact error, replace with the specific selector:
      //   vm.expectRevert(IBreadfund.TokenNotAllowed.selector);
      if (i % 9 == 0) {
        MockERC20 tmp = new MockERC20("Tmp", "TMP");
        cfg.token = address(tmp);
        vm.expectRevert(); // IBreadfund.TokenNotAllowed.selector (if used)
        breadfund.create(cfg);

        breadfund.setTokenAllowed(address(tmp), true);
        uint256 idAllowed = breadfund.create(cfg);
        assertEq(idAllowed, success, "id matches successes so far");
        success++;
        continue;
      }

      // Happy path: creation succeeds and ID is sequential.
      uint256 id = breadfund.create(cfg);
      assertEq(id, success, "id matches successes so far");
      success++;
    }

    // Global property: nextId equals the count of successful creations.
    assertEq(breadfund.nextId(), success, "nextId equals the number of successful creations");
  }
}
// ────────────────────────────────────────────────────────────────────────────────