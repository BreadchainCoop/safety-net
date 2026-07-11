// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {OwnableUpgradeable} from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';
import {IZkEmailFluVerifier} from 'src/interfaces/IZkEmailFluVerifier.sol';

import {MockFluClaimVerifier} from 'test/mocks/MockFluClaimVerifier.sol';
import {SafetyNetUnitBase} from 'test/unit/SafetyNetUnit.sol';

/// @dev SafetyNet's ZK Email flu-claim settlement path: verifier wiring and the instant,
///      contest-free payout of FLU_PAYOUT_DAYS at the member's daily support rate. All proof-side
///      checks live in the verifier and are unit-tested in ZkEmailFluVerifierUnit.sol; here the
///      verifier is mocked
contract FluClaimUnit is SafetyNetUnitBase {
  MockFluClaimVerifier internal _fluVerifier;
  bytes internal _proof = abi.encode('proof');

  function setUp() public override {
    super.setUp();
    _allowToken(address(_token));

    _fluVerifier = new MockFluClaimVerifier();
    vm.prank(_owner);
    _sn.setFluClaimVerifier(address(_fluVerifier));
  }

  // ---------- helpers ----------

  /// @dev Started default net (members [_alice, _bob]), everyone onboarded, advanced to epoch 1 —
  ///      the earliest state in which a flu claim is possible (clean dues + waiting period over)
  function _claimReadyNet() internal returns (uint256 id) {
    id = _createDefaultStarted(_defaultSafetyNet(address(_token)));
    _payInitial(id, _alice);
    _payInitial(id, _bob);
    _nextEpoch(id);
  }

  /// @dev FLU_PAYOUT_DAYS at a member's daily rate: contribution x min(effectiveRatio, cap) / 30 x 7
  function _expectedPayout(uint256 id, address member) internal view returns (uint256) {
    uint256 _ratio = _sn.getEffectiveRedeemRatio(id, member);
    uint256 _cap = _sn.FLU_MAX_SUPPORT_RATIO();
    if (_ratio > _cap) _ratio = _cap;
    return (_sn.safetyNetMemberContribute(id, member) * _ratio / 30) * _sn.FLU_PAYOUT_DAYS();
  }

  // ---------- setFluClaimVerifier ----------

  function test_SetFluClaimVerifierStoresAndEmits() public {
    address _newVerifier = makeAddr('newVerifier');

    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.FluClaimVerifierSet(_newVerifier);

    vm.prank(_owner);
    _sn.setFluClaimVerifier(_newVerifier);

    assertEq(_sn.fluClaimVerifier(), _newVerifier);
  }

  function test_SetFluClaimVerifierRevertsForNonOwner() public {
    vm.prank(_impostor);
    vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, _impostor));
    _sn.setFluClaimVerifier(address(0));
  }

  // ---------- claimFlu ----------

  function test_ClaimFluRevertsForNonMember() public {
    uint256 id = _claimReadyNet();

    vm.prank(_dave);
    vm.expectRevert(ISafetyNet.NotMember.selector);
    _sn.claimFlu(id, _proof);
  }

  function test_ClaimFluRevertsBeforeStart() public {
    uint256 id = _sn.create('', _defaultSafetyNet(address(_token)));

    vm.prank(_alice);
    vm.expectRevert(ISafetyNet.NotActive.selector);
    _sn.claimFlu(id, _proof);
  }

  function test_ClaimFluRevertsWhenDecommissioned() public {
    uint256 id = _createDefaultStarted(_defaultSafetyNet(address(_token)));

    // Skip an epoch with unpaid dues so the net becomes decommissionable, then wind it down
    _nextEpoch(id);
    _sn.decommission(id);

    vm.prank(_alice);
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    _sn.claimFlu(id, _proof);
  }

  function test_ClaimFluRevertsWithoutVerifier() public {
    uint256 id = _claimReadyNet();

    vm.prank(_owner);
    _sn.setFluClaimVerifier(address(0));

    vm.prank(_alice);
    vm.expectRevert(ISafetyNet.FluClaimVerifierNotSet.selector);
    _sn.claimFlu(id, _proof);
  }

  function test_ClaimFluBubblesVerifierRevert() public {
    uint256 id = _claimReadyNet();
    _fluVerifier.setShouldRevert(true);

    vm.prank(_alice);
    vm.expectRevert(IZkEmailFluVerifier.InvalidProof.selector);
    _sn.claimFlu(id, _proof);
  }

  function test_ClaimFluRevertsDuringFirstEpoch() public {
    // Everyone onboarded, but the net is still in epoch 0: Broodfonds-style waiting period
    uint256 id = _createDefaultStarted(_defaultSafetyNet(address(_token)));
    _payInitial(id, _alice);
    _payInitial(id, _bob);

    vm.prank(_alice);
    vm.expectRevert(ISafetyNet.FluClaimWaitingPeriod.selector);
    _sn.claimFlu(id, _proof);
  }

  function test_ClaimFluRevertsWhenDecommissionable() public {
    // _bob never onboarded, so epoch 0 dues are missing and the net is decommissionable —
    // full-rate flu claims must not front-run the pro-rata wind-down
    uint256 id = _createDefaultStarted(_defaultSafetyNet(address(_token)));
    _payInitial(id, _alice);
    _nextEpoch(id);

    vm.prank(_alice);
    vm.expectRevert(ISafetyNet.SafetyNetDecommissionable.selector);
    _sn.claimFlu(id, _proof);
  }

  function test_ClaimFluRevertsOnDustContribution() public {
    // A 1-wei contribution floors the daily support rate to zero
    ISafetyNet.SafetyNet memory _cfg = _defaultSafetyNet(address(_token));
    _cfg.initialDeposit = 1;
    _cfg.fixedDeposit = 1;
    uint256 id = _createDefaultStarted(_cfg);
    _payInitial(id, _alice);
    _payInitial(id, _bob);
    _nextEpoch(id);

    vm.prank(_alice);
    vm.expectRevert(ISafetyNet.InvalidAmountZero.selector);
    _sn.claimFlu(id, _proof);
  }

  function test_ClaimFluPaysFluPayoutInstantly() public {
    uint256 id = _claimReadyNet();
    uint256 _payout = _expectedPayout(id, _alice);

    uint256 _balanceBefore = _token.balanceOf(_alice);
    uint256 _withdrawableBefore = _sn.memberWithdrawableBalance(id, _alice);
    uint256 _poolBefore = _sn.safetyNetBalance(id);

    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.FluClaimSettled(id, _alice, _payout, _fluVerifier.nullifier());

    vm.prank(_alice);
    _sn.claimFlu(id, _proof);

    assertEq(_token.balanceOf(_alice), _balanceBefore + _payout);
    assertEq(_sn.memberWithdrawableBalance(id, _alice), _withdrawableBefore - _payout);
    assertEq(_sn.safetyNetBalance(id), _poolBefore - _payout);

    // No request was created: the contest phase is skipped entirely
    assertEq(_sn.getSafetyNetRequestIds(id).length, 0);
  }

  function test_ClaimFluForwardsClaimContextToVerifier() public {
    uint256 id = _claimReadyNet();

    vm.prank(_alice);
    _sn.claimFlu(id, _proof);

    assertEq(_fluVerifier.lastSafetyNetId(), id);
    assertEq(_fluVerifier.lastClaimant(), _alice);
    assertEq(_fluVerifier.lastProof(), _proof);
  }

  function test_ClaimFluRevertsWhenBalanceInsufficient() public {
    uint256 id = _claimReadyNet();

    // Drain alice's withdrawable balance below the flu payout via small instant withdrawals
    vm.startPrank(_alice);
    _sn.withdraw(id, 149, '');
    _sn.withdraw(id, 149, '');
    vm.stopPrank();

    assertLt(_sn.memberWithdrawableBalance(id, _alice), _expectedPayout(id, _alice));

    vm.prank(_alice);
    vm.expectRevert(ISafetyNet.NotWithdrawable.selector);
    _sn.claimFlu(id, _proof);
  }

  function test_ClaimFluCapsSupportRatio() public {
    // 25-member x22 net: the actuarial effective ratio is 15 (group-size cap at N=25), above
    // the flu cap of 12 — the payout must use 12, keeping systematic claiming EV-negative
    ISafetyNet.SafetyNet memory _cfg = _defaultSafetyNet(address(_token));
    _cfg.redeemRatio = 22;
    _cfg.maximumMembers = 25;

    address[] memory _joiners = new address[](24);
    for (uint256 i = 0; i < 24; i++) {
      _joiners[i] = makeAddr(string(abi.encodePacked('member', i)));
      _token.mint(_joiners[i], 1000 ether);
      vm.prank(_joiners[i]);
      _token.approve(address(_sn), type(uint256).max);
    }
    uint256 id = _createStartedWith(_cfg, _joiners);

    _payInitial(id, _alice);
    for (uint256 i = 0; i < 24; i++) {
      _payInitial(id, _joiners[i]);
    }
    _nextEpoch(id);

    uint256 _effectiveRatio = _sn.getEffectiveRedeemRatio(id, _alice);
    assertGt(_effectiveRatio, _sn.FLU_MAX_SUPPORT_RATIO());

    uint256 _cappedPayout = (_cfg.fixedDeposit * _sn.FLU_MAX_SUPPORT_RATIO() / 30) * _sn.FLU_PAYOUT_DAYS();
    uint256 _balanceBefore = _token.balanceOf(_alice);

    vm.prank(_alice);
    _sn.claimFlu(id, _proof);

    assertEq(_token.balanceOf(_alice), _balanceBefore + _cappedPayout);
  }
}
