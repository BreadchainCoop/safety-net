// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

import {SafetyNetUnitBase} from 'test/unit/SafetyNetUnit.sol';

/// @dev Broodfonds solidarity-ratio behavior: configured ratios above 1, the actuarial
///      effective-ratio caps (group size + pool coverage), pool-solvency reverts, and the
///      pro-rata shortfall branch of decommission().
///
///      Expected group-size caps with p = 2% (200 bps) and z = 1.65 (integer math, floors):
///        N=2 -> x5   N=3 -> x6   N=25 -> x15   N=50 -> x19
contract SolidarityRatioUnit is SafetyNetUnitBase {
  function setUp() public override {
    super.setUp();
    // The base funds alice/bob/carol; ratio tests also onboard the requester
    _token.mint(_requester, 1_000_000 ether);
    vm.prank(_requester);
    _token.approve(address(_sn), type(uint256).max);
    _allowToken(address(_token));
  }

  // ---------- helpers ----------

  /// @dev Default net reconfigured as a Broodfonds-style x22 solidarity fund
  function _ratioSafetyNet(uint256 _initialDeposit, uint256 _autoThreshold) internal view returns (ISafetyNet.SafetyNet memory _cfg) {
    _cfg = _defaultSafetyNet(address(_token));
    _cfg.redeemRatio = 22;
    _cfg.fixedDeposit = 10 ether;
    _cfg.initialDeposit = _initialDeposit;
    _cfg.autoThreshold = _autoThreshold;
  }

  // ---------- deposit crediting ----------

  function test_DepositCreditsWithdrawableAtConfiguredRatio() external {
    uint256 id = _createDefaultStarted(_ratioSafetyNet(200 ether, 50 ether));
    _payInitial(id, _alice);

    // The pool holds the actual tokens; the member's claim is leveraged by the ratio
    assertEq(_sn.safetyNetBalance(id), 200 ether);
    assertEq(_sn.memberWithdrawableBalance(id, _alice), 200 ether * 22);
  }

  // ---------- effective ratio ----------

  function test_EffectiveRatioGroupSizeCapBinds() external {
    // N=2 group cap is x5; pool 400e vs 6 months of 10e dues -> pool cap x6, so group cap binds
    uint256 id = _createDefaultStarted(_ratioSafetyNet(200 ether, 50 ether));
    _payInitial(id, _alice);
    _payInitial(id, _bob);

    assertEq(_sn.getEffectiveRedeemRatio(id, _alice), 5);
  }

  function test_EffectiveRatioPoolCoverageCapBinds() external {
    // Pool 200e must hold 6 months of support: cap = 200 / (6 * 10) = x3 < group cap x5
    uint256 id = _createDefaultStarted(_ratioSafetyNet(100 ether, 50 ether));
    _payInitial(id, _alice);
    _payInitial(id, _bob);

    assertEq(_sn.getEffectiveRedeemRatio(id, _alice), 3);
  }

  function test_EffectiveRatioFloorsAtSavingsCircle() external {
    // Pool 60e -> pool cap = 60 / 60 = x1: the fund pays out at savings-circle rate, never 0
    uint256 id = _createDefaultStarted(_ratioSafetyNet(30 ether, 50 ether));
    _payInitial(id, _alice);
    _payInitial(id, _bob);

    assertEq(_sn.getEffectiveRedeemRatio(id, _alice), 1);
  }

  function test_EffectiveRatioNeverThrottlesSavingsCircles() external {
    // Ratio-1 nets are fully backed by deposits: the risk caps must not apply
    uint256 id = _createDefaultStarted(_defaultSafetyNet(address(_token)));
    assertEq(_sn.getEffectiveRedeemRatio(id, _alice), 1);
  }

  function test_EffectiveRatioExposedInDetails() external {
    uint256 id = _createDefaultStarted(_ratioSafetyNet(100 ether, 50 ether));
    _payInitial(id, _alice);
    _payInitial(id, _bob);

    ISafetyNet.SafetyNetDetails memory _details = _sn.getSafetyNetDetails(id, _alice);
    assertEq(_details.effectiveRedeemRatio, _sn.getEffectiveRedeemRatio(id, _alice));
    assertEq(_details.effectiveRedeemRatio, 3);
  }

  // ---------- withdrawals ----------

  function test_WithdrawPaysAtEffectiveRatio() external {
    // Effective ratio x5 (group cap, see above): 3 days = 10e * 5 / 30 * 3
    uint256 id = _createDefaultStarted(_ratioSafetyNet(200 ether, 50 ether));
    _payInitial(id, _alice);
    _payInitial(id, _bob);

    uint256 _daily = (_sn.getSafetyNet(id).fixedDeposit * 5) / 30;
    uint256 _expected = _daily * 3;
    uint256 _before = _token.balanceOf(_alice);

    vm.prank(_alice);
    _sn.withdraw(id, 3, '');

    assertEq(_token.balanceOf(_alice) - _before, _expected);
    assertEq(_sn.safetyNetBalance(id), 400 ether - _expected);
  }

  function test_WithdrawRevertsWhenPoolCannotCover() external {
    // Pool 60e, effective ratio floored at x1: 200 days = 66.6e > pool, still under the
    // instant threshold (100e) so the payout is attempted immediately and must revert
    uint256 id = _createDefaultStarted(_ratioSafetyNet(30 ether, 100 ether));
    _payInitial(id, _alice);
    _payInitial(id, _bob);

    vm.prank(_alice);
    vm.expectRevert(ISafetyNet.InsufficientPoolFunds.selector);
    _sn.withdraw(id, 200, '');
  }

  function test_ExecuteRequestRevertsWhenPoolCannotCover() external {
    // Two large requests against a pool that only covers one: the second execution reverts
    ISafetyNet.SafetyNet memory _cfg = _ratioSafetyNet(60 ether, 1 ether);
    _cfg.minimumMembers = 3;
    _cfg.maximumMembers = 5;
    uint256 id = _createRequesterStarted(_cfg);
    _payInitial(id, _alice);
    _payInitial(id, _bob);
    _payInitial(id, _requester);
    // Pool 180e; effective ratio min(x22, group x6, pool 180/60 = x3) = x3; daily = 1e

    vm.prank(_requester);
    _sn.withdraw(id, 120, ''); // request 0: 120e > 1e threshold
    vm.prank(_alice);
    _sn.withdraw(id, 100, ''); // request 1: 100e

    vm.warp(block.timestamp + _cfg.contestWindow + 1);

    _sn.executeContestedWithdrawal(1); // pays alice 100e, pool drops to 80e

    // The view must reflect that the pool no longer covers request 0 …
    ISafetyNet.RequestView memory _view = _sn.getSafetyNetRequests(id)[0];
    assertEq(_view.request.amount, 120 ether);
    assertFalse(_view.isExecutable);
    assertGe(_sn.memberWithdrawableBalance(id, _requester), 120 ether);

    // … and execution must revert rather than underflow the pool
    vm.expectRevert(ISafetyNet.InsufficientPoolFunds.selector);
    _sn.executeContestedWithdrawal(0);
  }

  // ---------- decommission: pro-rata shortfall ----------

  function test_DecommissionShortfallDistributesProRata() external {
    uint256 id = _createDefaultStarted(_ratioSafetyNet(100 ether, 50 ether));
    _payInitial(id, _alice);
    _payInitial(id, _bob);
    // Alice prepays 5 future epochs, making the claims unequal
    vm.prank(_alice);
    _sn.deposit(id, 50 ether);

    // Pool 250e; claims: alice (100+50)*22 = 3300e, bob 100*22 = 2200e; total 5500e > pool
    // Bob misses epoch 1 -> decommissionable after epoch 1 fully elapses
    vm.warp(block.timestamp + 2 * _sn.getSafetyNet(id).epochDuration + 1);

    uint256 _aliceBefore = _token.balanceOf(_alice);
    uint256 _bobBefore = _token.balanceOf(_bob);

    vm.expectEmit(true, false, false, true, address(_sn));
    emit ISafetyNet.SafetyNetShortfallDistributed(id, 250 ether, 5500 ether);
    vm.prank(_alice);
    _sn.decommission(id);

    // Pro-rata: pool * claim / totalClaims — conservation is exact here (no dust)
    assertEq(_token.balanceOf(_alice) - _aliceBefore, (250 ether * 3300) / 5500);
    assertEq(_token.balanceOf(_bob) - _bobBefore, (250 ether * 2200) / 5500);
    assertEq(_sn.memberWithdrawableBalance(id, _alice), 0);
    assertEq(_sn.memberWithdrawableBalance(id, _bob), 0);
    assertEq(_sn.safetyNetBalance(id), 0);
  }

  function test_DecommissionShortfallSkipsZeroClaimMembers() external {
    uint256 id = _createDefaultStarted(_ratioSafetyNet(100 ether, 50 ether));
    // Only alice onboards; bob has no claim
    _payInitial(id, _alice);

    vm.warp(block.timestamp + _sn.getSafetyNet(id).epochDuration + 1);

    uint256 _aliceBefore = _token.balanceOf(_alice);
    uint256 _bobBefore = _token.balanceOf(_bob);

    vm.prank(_alice);
    _sn.decommission(id);

    // Alice holds 100% of claims and receives the whole pool; bob gets nothing
    assertEq(_token.balanceOf(_alice) - _aliceBefore, 100 ether);
    assertEq(_token.balanceOf(_bob), _bobBefore);
  }

  function test_DecommissionShortfallConservesPool() external {
    // Dust check with a pool that does not divide evenly across claims
    ISafetyNet.SafetyNet memory _cfg = _ratioSafetyNet(100 ether, 50 ether);
    _cfg.minimumMembers = 3;
    uint256 id = _createRequesterStarted(_cfg);
    _payInitial(id, _alice);
    _payInitial(id, _bob);
    _payInitial(id, _requester);
    // Unequal claims: alice prepays 7e (partial epoch fill)
    vm.prank(_alice);
    _sn.deposit(id, 7 ether);

    vm.warp(block.timestamp + 2 * _sn.getSafetyNet(id).epochDuration + 1);

    uint256 _pool = _sn.safetyNetBalance(id);
    uint256 _contractBefore = _token.balanceOf(address(_sn));

    vm.prank(_alice);
    _sn.decommission(id);

    // Everything paid out except floor-division dust, which stays in the contract
    uint256 _paidOut = _contractBefore - _token.balanceOf(address(_sn));
    assertLe(_pool - _paidOut, 3); // dust < member count wei
    assertGt(_paidOut, 0);
  }
}
