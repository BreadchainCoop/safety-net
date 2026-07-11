// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {DelegatedSafetyNet} from 'src/contracts/DelegatedSafetyNet.sol';
import {IDelegatedSafetyNet} from 'src/interfaces/IDelegatedSafetyNet.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

import {SafetyNetUnitBase} from 'test/unit/SafetyNetUnit.sol';

contract DelegatedSafetyNetUnit is SafetyNetUnitBase {
  DelegatedSafetyNet internal _delegated;

  function setUp() public override {
    super.setUp();
    _delegated = new DelegatedSafetyNet(address(_sn));
    _allowToken(address(_token));
  }

  // ---------- helpers ----------

  /// @dev Started default net [alice(owner), bob]; members approve the PROXY and opt into delegation
  function _startedWithDelegation() internal returns (uint256 id) {
    id = _createDefaultStarted(_defaultSafetyNet(address(_token)));
    // Members already approve the proxy for max in the base setUp; opt in here
    vm.prank(_alice);
    _delegated.setDelegatedDepositsEnabled(true);
    vm.prank(_bob);
    _delegated.setDelegatedDepositsEnabled(true);
  }

  function _initialDeposit(uint256 id) internal view returns (uint256) {
    return _sn.getSafetyNet(id).initialDeposit;
  }

  // ---------- opt-in ----------

  function test_SetDelegatedDepositsEnabledTogglesAndEmits() external {
    vm.expectEmit(true, true, false, false, address(_delegated));
    emit IDelegatedSafetyNet.DelegatedDepositsToggled(_bob, true);
    vm.prank(_bob);
    _delegated.setDelegatedDepositsEnabled(true);
    assertTrue(_delegated.isDelegatedDepositsEnabled(_bob));

    vm.prank(_bob);
    _delegated.setDelegatedDepositsEnabled(false);
    assertFalse(_delegated.isDelegatedDepositsEnabled(_bob));
  }

  // ---------- depositIfAllowed: happy path ----------

  function test_DepositIfAllowedOnboardsMemberWithInitialDeposit() external {
    uint256 id = _startedWithDelegation();
    uint256 initial = _initialDeposit(id);

    _delegated.depositIfAllowed(id, _bob);

    (address[] memory members, uint256[] memory balances) = _sn.getMemberBalances(id);
    // bob is index 1 (alice owner is index 0)
    assertEq(members[1], _bob);
    assertEq(balances[1], initial);
    // onboarding recorded the monthly contribution
    assertEq(_sn.safetyNetMemberContribute(id, _bob), _sn.getSafetyNet(id).fixedDeposit);
  }

  function test_DepositIfAllowedPaysRecurringDuesAfterOnboarding() external {
    uint256 id = _startedWithDelegation();

    // Onboard bob
    _delegated.depositIfAllowed(id, _bob);

    // Advance one epoch so dues accrue again
    _nextEpoch(id);
    uint256 fixedDeposit = _sn.getSafetyNet(id).fixedDeposit;
    assertEq(_sn.duesRemainingThisEpoch(id, _bob), fixedDeposit);

    _delegated.depositIfAllowed(id, _bob);
    assertEq(_sn.duesRemainingThisEpoch(id, _bob), 0);
  }

  // ---------- depositIfAllowed: reverts ----------

  function test_DepositIfAllowedRevertsWhenNotOptedIn() external {
    uint256 id = _createDefaultStarted(_defaultSafetyNet(address(_token)));
    vm.expectRevert(IDelegatedSafetyNet.DelegatedDepositsNotEnabled.selector);
    _delegated.depositIfAllowed(id, _bob);
  }

  function test_DepositIfAllowedRevertsWhenNotMember() external {
    uint256 id = _startedWithDelegation();
    // carol opted in but never joined the net
    vm.prank(_carol);
    _delegated.setDelegatedDepositsEnabled(true);
    vm.expectRevert(ISafetyNet.NotMember.selector);
    _delegated.depositIfAllowed(id, _carol);
  }

  function test_DepositIfAllowedRevertsWhenNetNotStarted() external {
    // create but do not start
    uint256 id = _sn.create('', _defaultSafetyNet(address(_token)));
    _redeemInviteAs(id, _bob, _aliceKey);
    vm.prank(_bob);
    _delegated.setDelegatedDepositsEnabled(true);
    vm.expectRevert(ISafetyNet.NotActive.selector);
    _delegated.depositIfAllowed(id, _bob);
  }

  function test_DepositIfAllowedRevertsWhenAlreadyDeposited() external {
    uint256 id = _startedWithDelegation();
    _delegated.depositIfAllowed(id, _bob); // onboards
    // Same epoch, dues fully paid -> nothing owed
    vm.expectRevert(ISafetyNet.AlreadyDeposited.selector);
    _delegated.depositIfAllowed(id, _bob);
  }

  function test_DepositIfAllowedRevertsWhenInsufficientAllowance() external {
    uint256 id = _createDefaultStarted(_defaultSafetyNet(address(_token)));
    // bob opts in but revokes the proxy allowance
    vm.startPrank(_bob);
    _delegated.setDelegatedDepositsEnabled(true);
    _token.approve(address(_sn), 0);
    vm.stopPrank();
    vm.expectRevert(IDelegatedSafetyNet.InsufficientAllowance.selector);
    _delegated.depositIfAllowed(id, _bob);
  }

  function test_DepositIfAllowedRevertsForDecommissionedNet() external {
    uint256 id = _startedWithDelegation();
    // A net only becomes decommissionable once a past epoch has an unpaid member;
    // warp past one epoch (nobody has deposited) so decommission() is allowed.
    vm.warp(block.timestamp + _sn.getSafetyNet(id).epochDuration + 1);
    vm.prank(_alice);
    _sn.decommission(id);
    // getSafetyNet reverts NotCommissioned for decommissioned nets
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    _delegated.depositIfAllowed(id, _bob);
  }

  // ---------- batch ----------

  function test_BatchDepositIfAllowedOnboardsMultiple() external {
    uint256 id = _startedWithDelegation();
    uint256 initial = _initialDeposit(id);

    uint256[] memory ids = new uint256[](2);
    address[] memory members = new address[](2);
    ids[0] = id;
    ids[1] = id;
    members[0] = _alice;
    members[1] = _bob;

    _delegated.batchDepositIfAllowed(ids, members);

    (, uint256[] memory balances) = _sn.getMemberBalances(id);
    assertEq(balances[0], initial); // alice
    assertEq(balances[1], initial); // bob
  }

  function test_BatchDepositIfAllowedRevertsOnLengthMismatch() external {
    uint256[] memory ids = new uint256[](2);
    address[] memory members = new address[](1);
    vm.expectRevert(IDelegatedSafetyNet.ArrayLengthMismatch.selector);
    _delegated.batchDepositIfAllowed(ids, members);
  }

  function test_BatchDepositIfAllowedIsAllOrNothing() external {
    uint256 id = _startedWithDelegation();

    // carol opted in but is NOT a member -> her entry fails, reverting the whole batch
    vm.prank(_carol);
    _delegated.setDelegatedDepositsEnabled(true);

    uint256[] memory ids = new uint256[](2);
    address[] memory members = new address[](2);
    ids[0] = id;
    ids[1] = id;
    members[0] = _bob; // valid
    members[1] = _carol; // invalid: not a member

    vm.expectRevert(ISafetyNet.NotMember.selector);
    _delegated.batchDepositIfAllowed(ids, members);

    // Nothing was deposited: bob's onboarding was rolled back
    assertEq(_sn.safetyNetMemberContribute(id, _bob), 0);
    (, uint256[] memory balances) = _sn.getMemberBalances(id);
    assertEq(balances[1], 0);
  }

  // ---------- getAddressesForDeposit ----------

  function test_GetAddressesForDepositEnumeratesOptedInOwing() external {
    uint256 id = _startedWithDelegation();
    // alice + bob opted in, both owe their initial deposit, both approved the proxy
    (uint256[] memory ids, address[] memory members) = _delegated.getAddressesForDeposit();
    assertEq(ids.length, 2);
    assertEq(members.length, 2);
    // Both entries belong to `id`
    assertEq(ids[0], id);
    assertEq(ids[1], id);
    // Members are alice and bob in net order
    assertEq(members[0], _alice);
    assertEq(members[1], _bob);
  }

  function test_GetAddressesForDepositExcludesNotOptedIn() external {
    uint256 id = _createDefaultStarted(_defaultSafetyNet(address(_token)));
    // Only bob opts in
    vm.prank(_bob);
    _delegated.setDelegatedDepositsEnabled(true);

    (uint256[] memory ids, address[] memory members) = _delegated.getAddressesForDeposit();
    assertEq(ids.length, 1);
    assertEq(members[0], _bob);
    assertEq(ids[0], id);
  }

  function test_GetAddressesForDepositExcludesAlreadyPaid() external {
    uint256 id = _startedWithDelegation();
    // Onboard bob so he owes nothing this epoch
    _delegated.depositIfAllowed(id, _bob);

    (uint256[] memory ids, address[] memory members) = _delegated.getAddressesForDeposit();
    // Only alice remains owing
    assertEq(ids.length, 1);
    assertEq(members[0], _alice);
  }

  function test_GetAddressesForDepositExcludesInsufficientAllowance() external {
    uint256 id = _startedWithDelegation();
    // bob revokes his proxy allowance
    vm.prank(_bob);
    _token.approve(address(_sn), 0);

    (uint256[] memory ids, address[] memory members) = _delegated.getAddressesForDeposit();
    assertEq(ids.length, 1);
    assertEq(members[0], _alice);
    assertEq(ids[0], id);
  }

  function test_GetAddressesForDepositExcludesDecommissionedNet() external {
    uint256 id = _startedWithDelegation();
    // Warp past one epoch (nobody deposited) so the net is decommissionable.
    vm.warp(block.timestamp + _sn.getSafetyNet(id).epochDuration + 1);
    vm.prank(_alice);
    _sn.decommission(id);

    (uint256[] memory ids, address[] memory members) = _delegated.getAddressesForDeposit();
    assertEq(ids.length, 0);
    assertEq(members.length, 0);
  }

  function test_GetAddressesForDepositExcludesNotStartedNet() external {
    // Create but do not start; owner (alice) is a member and opts in
    uint256 id = _sn.create('', _defaultSafetyNet(address(_token)));
    _redeemInviteAs(id, _bob, _aliceKey);
    vm.prank(_alice);
    _delegated.setDelegatedDepositsEnabled(true);
    vm.prank(_bob);
    _delegated.setDelegatedDepositsEnabled(true);

    (uint256[] memory ids, address[] memory members) = _delegated.getAddressesForDeposit();
    assertEq(ids.length, 0);
    assertEq(members.length, 0);
  }
}
