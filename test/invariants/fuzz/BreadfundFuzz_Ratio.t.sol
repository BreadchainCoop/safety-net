// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * BreadfundFuzz_Ratio.t.sol
 *
 * Purpose: Probe the effect of the `ratio` parameter on conservation of funds.
 *
 * Context:
 *  - Ratio > 1 multiplies withdrawables beyond actual contract balance, exposing
 *    an *economic bug surface* (insolvency risk).
 *  - Ratio = 1 (sane case) should preserve strict conservation: contract balance
 *    ≥ member withdrawable.
 *
 * Properties checked:
 *  - For ratio > 1, `withdrawable > contract balance` is possible → bug surface.
 *  - For ratio = 1, conservation holds for arbitrary deposits.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 */

import {BreadfundFuzzBase} from "./BreadfundFuzzBase.t.sol";
import {IBreadfund} from "src/interfaces/IBreadfund.sol";
import {Breadfund} from "src/contracts/Breadfund.sol";
import {MockERC20} from "test/mocks/MockERC20.sol";

contract BreadfundFuzz_Ratio is BreadfundFuzzBase {
  /// -------------------------------------------------------------------------
  /// Scenario: Ratio > 1
  /// Property: Member's withdrawable balance can exceed actual held tokens.
  /// Impact: Economic bug surface (contract becomes insolvent on paper).
  /// When fixed: Creation with ratio > 1 should revert; update to expect revert.
  /// -------------------------------------------------------------------------
  function testFuzz_Ratio_CanBreakConservation(uint256 ratio) public {
    ratio = bound(ratio, 2, 100);

    (Breadfund localFund, MockERC20 localToken) = _deployIsolatedFund();
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.token = address(localToken);
    cfg.members = _threeMembers();
    cfg.ratio = ratio;
    cfg.breadfundStart = block.timestamp;

    uint256 idLocal = localFund.create(cfg);

    uint256 depositValue = 1e18;
    _mintApproveLocal(localToken, member1, depositValue + cfg.initialDeposit + cfg.fixedDeposit, address(localFund));
    vm.prank(member1); localFund.deposit(idLocal, depositValue);

    uint256 contractHeld = localToken.balanceOf(address(localFund));
    uint256 withdrawable = localFund.memberWithdrawableBalance(idLocal, member1);
    assertLt(contractHeld, withdrawable, "withdrawable exceeds held tokens for ratio > 1");
  }

  /// -------------------------------------------------------------------------
  /// Scenario: Ratio = 1 (sane)
  /// Property: Conservation holds — contract balance always covers withdrawables.
  /// -------------------------------------------------------------------------
  function testFuzz_Conservation_Holds_ForSaneRatio(uint256 value) public {
    value = bound(value, 1e16, 5e18);

    (Breadfund localFund, MockERC20 localToken) = _deployIsolatedFund();
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.token = address(localToken);
    cfg.members = _threeMembers();
    cfg.ratio = 1;
    cfg.breadfundStart = block.timestamp;

    uint256 idLocal = localFund.create(cfg);

    _mintApproveLocal(localToken, member1, value + cfg.initialDeposit + cfg.fixedDeposit, address(localFund));
    vm.prank(member1); localFund.deposit(idLocal, value);

    uint256 contractHeld = localToken.balanceOf(address(localFund));
    uint256 withdrawable = localFund.memberWithdrawableBalance(idLocal, member1);
    assertGe(contractHeld, withdrawable, "conservation should hold for ratio <= 1");
  }
}
/// ────────────────────────────────────────────────────────────────────────────────