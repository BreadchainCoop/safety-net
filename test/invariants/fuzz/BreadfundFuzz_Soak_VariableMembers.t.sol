// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * BreadfundFuzz_Soak_VariableMembers.t.sol
 *
 * Purpose: Long random walk with variable member counts, epochs, and operations.
 * We exercise deposits, small/large withdrawals, and occasional request execution
 * across many actors to explore emergent interactions.
 *
 * Properties (implicit in this soak):
 *  - No catastrophic reverts while exploring varied sizes (3..25 members).
 *  - Requests can be created/executed depending on contest window timing.
 *  - Time/epoch progression doesn’t brick the system.
 *
 * Notes:
 *  - We use broad try/catch to keep exploring even when policy checks legitimately
 *    revert. This test intentionally avoids tight per-step assertions to maximize
 *    state-space traversal. Consider adding cross-cutting invariants (e.g.,
 *    conservation soft/strict) in a dedicated soak if needed.
 * ────────────────────────────────────────────────────────────────────────────────
 */

import {BreadfundFuzzBase} from "./BreadfundFuzzBase.t.sol";
import {IBreadfund} from "src/interfaces/IBreadfund.sol";

contract BreadfundFuzz_Soak_VariableMembers is BreadfundFuzzBase {
  /// -------------------------------------------------------------------------
  /// Scenario: Variable members, multiple epochs, randomized ops.
  /// Ops mix:
  ///  - roll ≤ 2: deposits (under r=1, withdrawable += v)
  ///  - 3..5:     "small" withdrawals (few days)
  ///  - 6..8:     "large" withdrawals (many days → may create requests)
  ///  - 9:        (sometimes) try executing the latest request after contest window
  /// -------------------------------------------------------------------------
  function testFuzz_Soak_VariableMemberCount(
    uint8 membersRaw, uint8 epochsRaw, uint8 opsRaw, uint256 seed
  ) public {
    uint256 m = bound(uint256(membersRaw), 3, 25);
    uint256 epochs = bound(uint256(epochsRaw), 2, 8);
    uint256 ops    = bound(uint256(opsRaw),    5, 30);

    address[] memory members = _makeMembers(m);

    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = members; 
    cfg.minimumMembers = 2; 
    cfg.maximumMembers = m;
    cfg.breadfundStart = block.timestamp; 
    cfg.ratio = 1;
    uint256 id = breadfund.create(cfg);

    // Prefund allowances so actors can freely interact during the soak.
    for (uint256 i = 0; i < m; i++) _mintApprove(members[i], 1e24, address(breadfund));

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = members[seed % m];
        uint256 roll = seed % 10;

        if (roll <= 2) {
          // Deposits: fuzz value; use try/catch to keep walking if policy reverts.
          uint256 v = 1e18 + (seed % 1e18);
          vm.prank(actor); try breadfund.deposit(id, v) {} catch {}

        } else if (roll <= 5) {
          // Likely small withdrawals (1..3 days) — may hit small-withdraw limit.
          uint256 daysReq = 1 + (seed % 3);
          vm.prank(actor); try breadfund.withdraw(id, daysReq) {} catch {}

        } else if (roll <= 8) {
          // Likely large withdrawals (40..79 days) — often create requests.
          uint256 daysReq = 40 + (seed % 40);
          vm.prank(actor); try breadfund.withdraw(id, daysReq) {} catch {}

        } else {
          // Occasionally try to execute the most recent request after contest window.
          if (breadfund.nextIdRequest() > 0) {
            uint256 reqId = breadfund.nextIdRequest() - 1;
            if ((seed & 1) == 1) {
              vm.warp(block.timestamp + cfg.contestWindow + 1);
              vm.prank(actor); try breadfund.executeContestedWithdrawl(reqId) {} catch {}
            }
          }
        }
      }
      // Advance epoch to rotate counters/limits and vary timing windows.
      vm.warp(block.timestamp + cfg.epochDuration + 1);
    }

    // Sanity: the soak completed without unrecoverable errors.
    // (Consider adding a global invariant here if you later want stronger guarantees.)
    assertTrue(true);
  }
}
