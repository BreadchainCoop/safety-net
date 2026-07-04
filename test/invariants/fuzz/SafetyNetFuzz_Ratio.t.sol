// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';

import {SafetyNetFuzzBase} from './SafetyNetFuzzBase.t.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

/// @notice Solidarity-ratio invariants fuzzed across the full configurable range [1, 25]:
///         the pool can never underflow (every payout either moves exactly its amount or
///         reverts cleanly), the effective ratio stays within [1, configured], and the
///         pro-rata decommission branch conserves the pool to within member-count dust.
contract SafetyNetFuzz_Ratio is SafetyNetFuzzBase {
  /// @dev Deposit/withdraw soak at an arbitrary ratio: token accounting must stay exact and
  ///      the effective ratio must stay within bounds after every operation.
  function testFuzz_RatioSoak_PoolNeverUnderflows(uint8 ratioRaw, uint8 epochsRaw, uint8 opsRaw, uint256 seed) public {
    uint256 ratio = bound(uint256(ratioRaw), 1, 25);
    uint256 epochs = bound(uint256(epochsRaw), 1, 6);
    uint256 ops = bound(uint256(opsRaw), 3, 15);

    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.redeemRatio = ratio;
    uint256 id = _createStarted(config, _defaultMembers);

    _mintApprove(_member1, 1e24, address(_safetyNet));
    _mintApprove(_member2, 1e24, address(_safetyNet));
    _mintApprove(_member3, 1e24, address(_safetyNet));

    for (uint256 e = 0; e < epochs; e++) {
      for (uint256 k = 0; k < ops; k++) {
        seed = uint256(keccak256(abi.encodePacked(seed, e, k)));
        address actor = _pick(_defaultMembers, seed);

        if (seed % 3 != 0) {
          _depositAs(actor, id, 1e18 + (seed % 50e18));
        } else {
          _tryWithdraw(id, actor, 1 + (seed % 40));
        }

        // The pool is always fully collateralized by real tokens
        assertGe(_token.balanceOf(address(_safetyNet)), _safetyNet.safetyNetBalance(id), 'pool over-collateralized');

        // The effective ratio never exceeds the configured aspiration and never drops below 1
        uint256 effective = _safetyNet.getEffectiveRedeemRatio(id, actor);
        assertLe(effective, ratio, 'effective <= configured');
        assertGe(effective, 1, 'effective >= 1');
      }
      vm.warp(block.timestamp + config.epochDuration + 1);
    }
  }

  /// @dev A withdrawal either transfers exactly its amount out of the pool or reverts with one
  ///      of the expected guards — never a panic/underflow.
  function _tryWithdraw(uint256 id, address actor, uint256 daysRequested) internal {
    uint256 poolBefore = _safetyNet.safetyNetBalance(id);
    uint256 balBefore = _token.balanceOf(actor);

    vm.prank(actor);
    try _safetyNet.withdraw(id, daysRequested, '') {
      uint256 poolAfter = _safetyNet.safetyNetBalance(id);
      uint256 paid = _token.balanceOf(actor) - balBefore;
      // Instant payout moved exactly the pool delta; a created request moves nothing yet
      assertEq(poolBefore - poolAfter, paid, 'pool delta matches transfer');
    } catch (bytes memory err) {
      bytes4 sel = bytes4(err);
      assertTrue(
        sel == ISafetyNet.NotWithdrawable.selector || sel == ISafetyNet.InsufficientPoolFunds.selector
          || sel == ISafetyNet.ExceedsSmallWithdrawalLimit.selector,
        'only expected withdraw guards'
      );
    }
  }

  /// @dev Shortfall decommission at ratio > 1: every member receives pool x claim / totalClaims
  ///      and the whole pool leaves the contract except floor-division dust (< member count wei).
  function testFuzz_Decommission_ProRataConservesPool(uint8 ratioRaw, uint256 prepaySeed) public {
    uint256 ratio = bound(uint256(ratioRaw), 2, 25);

    ISafetyNet.SafetyNet memory config = _safeCfg;
    config.redeemRatio = ratio;
    uint256 id = _createStarted(config, _defaultMembers);

    _mintApprove(_member1, 1e24, address(_safetyNet));
    _mintApprove(_member2, 1e24, address(_safetyNet));
    _mintApprove(_member3, 1e24, address(_safetyNet));

    // Onboard everyone, then skew claims with random prepays so the pro-rata shares differ
    for (uint256 i = 0; i < _defaultMembers.length; i++) {
      _depositAs(_defaultMembers[i], id, _safeCfg.initialDeposit);
      uint256 extra = uint256(keccak256(abi.encodePacked(prepaySeed, i))) % (3 * _safeCfg.fixedDeposit);
      if (extra > 0) {
        vm.prank(_defaultMembers[i]);
        _safetyNet.deposit(id, extra);
      }
    }

    uint256 totalClaims;
    uint256[] memory claims = new uint256[](_defaultMembers.length);
    for (uint256 i = 0; i < _defaultMembers.length; i++) {
      claims[i] = _safetyNet.memberWithdrawableBalance(id, _defaultMembers[i]);
      totalClaims += claims[i];
    }
    uint256 pool = _safetyNet.safetyNetBalance(id);
    // At ratio >= 2 with no withdrawals, claims (deposits x ratio) always exceed the pool
    assertGt(totalClaims, pool, 'shortfall scenario');

    // Prepays cover at most 3 future epochs, so after 5 epochs some epoch is unpaid for
    // every member — the net is guaranteed decommissionable
    vm.warp(block.timestamp + 5 * config.epochDuration + 1);

    uint256[] memory before = new uint256[](_defaultMembers.length);
    for (uint256 i = 0; i < _defaultMembers.length; i++) {
      before[i] = _token.balanceOf(_defaultMembers[i]);
    }

    vm.prank(_member1);
    _safetyNet.decommission(id);

    uint256 paidOut;
    for (uint256 i = 0; i < _defaultMembers.length; i++) {
      uint256 delta = _token.balanceOf(_defaultMembers[i]) - before[i];
      assertEq(delta, Math.mulDiv(pool, claims[i], totalClaims), 'pro-rata share');
      paidOut += delta;
      assertEq(_safetyNet.memberWithdrawableBalance(id, _defaultMembers[i]), 0, 'claim zeroed');
    }

    assertLe(pool - paidOut, _defaultMembers.length, 'dust below member count');
    assertEq(_safetyNet.safetyNetBalance(id), 0, 'pool accounting zeroed');
  }
}
