// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ProxyAdmin} from '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';
import {Test} from 'forge-std/Test.sol';

import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';
import {MockERC20} from 'test/mocks/MockERC20.sol';

/// @title SafetyNetConfigurable
/// @notice Unit tests for owner-controlled governance parameter setters (#41)
contract SafetyNetConfigurable is Test {
  SafetyNet internal _sn;
  MockERC20 internal _token;

  address internal _owner;
  uint256 internal _ownerKey;
  address internal _nonOwner = makeAddr('nonOwner');
  address internal _alice = makeAddr('alice');
  address internal _bob = makeAddr('bob');

  uint256 internal _snId;

  function setUp() public {
    (_owner, _ownerKey) = makeAddrAndKey('owner');

    // Deploy upgradeable proxy
    address impl = address(new SafetyNet());
    address admin = address(new ProxyAdmin(_owner));
    address proxy = address(
      new TransparentUpgradeableProxy(impl, admin, abi.encodeWithSelector(SafetyNet.initialize.selector, _owner))
    );
    _sn = SafetyNet(proxy);

    _token = new MockERC20('Mock', 'MOCK');

    // Whitelist token (contract-level owner)
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);

    // Mint and approve for members
    _token.mint(_alice, 1_000_000 ether);
    _token.mint(_bob, 1_000_000 ether);
    vm.prank(_alice);
    _token.approve(address(_sn), type(uint256).max);
    vm.prank(_bob);
    _token.approve(address(_sn), type(uint256).max);

    // Create a default Safety Net owned by _owner
    address[] memory members = new address[](2);
    members[0] = _alice;
    members[1] = _bob;

    ISafetyNet.SafetyNet memory sn = ISafetyNet.SafetyNet({
      id: 0,
      owner: _owner,
      minimumMembers: 2,
      maximumMembers: 5,
      consensusThreshold: 60,
      safetyNetStart: block.timestamp,
      token: address(_token),
      members: members,
      initialDeposit: 100 ether,
      fixedDeposit: 10 ether,
      redeemRatio: 1,
      autoThreshold: 50 ether,
      contestWindow: 3 days,
      votingWindow: 7 days,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });

    vm.prank(_owner);
    _snId = _sn.create(sn);
  }

  // -----------------------------------------------------------------------
  // setConsensusThreshold
  // -----------------------------------------------------------------------

  function test_setConsensusThreshold_ownerSuccess() public {
    vm.prank(_owner);
    _sn.setConsensusThreshold(_snId, 75);
    assertEq(_sn.getSafetyNet(_snId).consensusThreshold, 75);
  }

  function test_setConsensusThreshold_nonOwnerReverts() public {
    vm.prank(_nonOwner);
    vm.expectRevert(ISafetyNet.Unauthorized.selector);
    _sn.setConsensusThreshold(_snId, 75);
  }

  function test_setConsensusThreshold_zeroReverts() public {
    vm.prank(_owner);
    vm.expectRevert(ISafetyNet.InvalidConsensusThreshold.selector);
    _sn.setConsensusThreshold(_snId, 0);
  }

  function test_setConsensusThreshold_101Reverts() public {
    vm.prank(_owner);
    vm.expectRevert(ISafetyNet.InvalidConsensusThreshold.selector);
    _sn.setConsensusThreshold(_snId, 101);
  }

  function test_setConsensusThreshold_boundary1Succeeds() public {
    vm.prank(_owner);
    _sn.setConsensusThreshold(_snId, 1);
    assertEq(_sn.getSafetyNet(_snId).consensusThreshold, 1);
  }

  function test_setConsensusThreshold_boundary100Succeeds() public {
    vm.prank(_owner);
    _sn.setConsensusThreshold(_snId, 100);
    assertEq(_sn.getSafetyNet(_snId).consensusThreshold, 100);
  }

  function test_setConsensusThreshold_emitsParameterUpdated() public {
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.ParameterUpdated(_snId, keccak256('consensusThreshold'), 80);
    vm.prank(_owner);
    _sn.setConsensusThreshold(_snId, 80);
  }

  // -----------------------------------------------------------------------
  // setAutoThreshold
  // -----------------------------------------------------------------------

  function test_setAutoThreshold_ownerSuccess() public {
    vm.prank(_owner);
    _sn.setAutoThreshold(_snId, 100 ether);
    assertEq(_sn.getSafetyNet(_snId).autoThreshold, 100 ether);
  }

  function test_setAutoThreshold_nonOwnerReverts() public {
    vm.prank(_nonOwner);
    vm.expectRevert(ISafetyNet.Unauthorized.selector);
    _sn.setAutoThreshold(_snId, 100 ether);
  }

  function test_setAutoThreshold_zeroReverts() public {
    vm.prank(_owner);
    vm.expectRevert(ISafetyNet.InvalidThreshold.selector);
    _sn.setAutoThreshold(_snId, 0);
  }

  function test_setAutoThreshold_emitsParameterUpdated() public {
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.ParameterUpdated(_snId, keccak256('autoThreshold'), 200 ether);
    vm.prank(_owner);
    _sn.setAutoThreshold(_snId, 200 ether);
  }

  // -----------------------------------------------------------------------
  // setSmallWithdrawsLimit
  // -----------------------------------------------------------------------

  function test_setSmallWithdrawsLimit_ownerSuccess() public {
    vm.prank(_owner);
    _sn.setSmallWithdrawsLimit(_snId, 5);
    assertEq(_sn.getSafetyNet(_snId).smallWithdrawsLimit, 5);
  }

  function test_setSmallWithdrawsLimit_nonOwnerReverts() public {
    vm.prank(_nonOwner);
    vm.expectRevert(ISafetyNet.Unauthorized.selector);
    _sn.setSmallWithdrawsLimit(_snId, 5);
  }

  function test_setSmallWithdrawsLimit_zeroReverts() public {
    vm.prank(_owner);
    vm.expectRevert(ISafetyNet.InvalidSmallWithdrawsLimit.selector);
    _sn.setSmallWithdrawsLimit(_snId, 0);
  }

  function test_setSmallWithdrawsLimit_emitsParameterUpdated() public {
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.ParameterUpdated(_snId, keccak256('smallWithdrawsLimit'), 10);
    vm.prank(_owner);
    _sn.setSmallWithdrawsLimit(_snId, 10);
  }

  // -----------------------------------------------------------------------
  // setContestWindow
  // -----------------------------------------------------------------------

  function test_setContestWindow_ownerSuccess() public {
    // contestWindow must be <= votingWindow (7 days); use 2 days
    vm.prank(_owner);
    _sn.setContestWindow(_snId, 2 days);
    assertEq(_sn.getSafetyNet(_snId).contestWindow, 2 days);
  }

  function test_setContestWindow_nonOwnerReverts() public {
    vm.prank(_nonOwner);
    vm.expectRevert(ISafetyNet.Unauthorized.selector);
    _sn.setContestWindow(_snId, 2 days);
  }

  function test_setContestWindow_zeroReverts() public {
    vm.prank(_owner);
    vm.expectRevert(ISafetyNet.InvalidContestWindow.selector);
    _sn.setContestWindow(_snId, 0);
  }

  function test_setContestWindow_exceedsVotingWindowReverts() public {
    // votingWindow is 7 days; setting contestWindow to 8 days should revert
    vm.prank(_owner);
    vm.expectRevert(ISafetyNet.InvalidContestWindow.selector);
    _sn.setContestWindow(_snId, 8 days);
  }

  function test_setContestWindow_equalToVotingWindowSucceeds() public {
    // contestWindow == votingWindow is valid (<=)
    vm.prank(_owner);
    _sn.setContestWindow(_snId, 7 days);
    assertEq(_sn.getSafetyNet(_snId).contestWindow, 7 days);
  }

  function test_setContestWindow_emitsParameterUpdated() public {
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.ParameterUpdated(_snId, keccak256('contestWindow'), 2 days);
    vm.prank(_owner);
    _sn.setContestWindow(_snId, 2 days);
  }

  // -----------------------------------------------------------------------
  // setVotingWindow
  // -----------------------------------------------------------------------

  function test_setVotingWindow_ownerSuccess() public {
    // votingWindow must be >= contestWindow (3 days); use 10 days
    vm.prank(_owner);
    _sn.setVotingWindow(_snId, 10 days);
    assertEq(_sn.getSafetyNet(_snId).votingWindow, 10 days);
  }

  function test_setVotingWindow_nonOwnerReverts() public {
    vm.prank(_nonOwner);
    vm.expectRevert(ISafetyNet.Unauthorized.selector);
    _sn.setVotingWindow(_snId, 10 days);
  }

  function test_setVotingWindow_zeroReverts() public {
    vm.prank(_owner);
    vm.expectRevert(ISafetyNet.InvalidVotingWindow.selector);
    _sn.setVotingWindow(_snId, 0);
  }

  function test_setVotingWindow_belowContestWindowReverts() public {
    // contestWindow is 3 days; setting votingWindow to 2 days should revert
    vm.prank(_owner);
    vm.expectRevert(ISafetyNet.InvalidVotingWindow.selector);
    _sn.setVotingWindow(_snId, 2 days);
  }

  function test_setVotingWindow_equalToContestWindowSucceeds() public {
    // votingWindow == contestWindow is valid (>=)
    vm.prank(_owner);
    _sn.setVotingWindow(_snId, 3 days);
    assertEq(_sn.getSafetyNet(_snId).votingWindow, 3 days);
  }

  function test_setVotingWindow_emitsParameterUpdated() public {
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.ParameterUpdated(_snId, keccak256('votingWindow'), 14 days);
    vm.prank(_owner);
    _sn.setVotingWindow(_snId, 14 days);
  }

  // -----------------------------------------------------------------------
  // Cross-parameter constraint tests
  // -----------------------------------------------------------------------

  function test_reduceVotingWindow_thenContestWindowBecomesTooLarge() public {
    // Reduce votingWindow to 4 days first (still >= contestWindow of 3 days)
    vm.prank(_owner);
    _sn.setVotingWindow(_snId, 4 days);

    // Now try to set contestWindow to 5 days — exceeds new votingWindow
    vm.prank(_owner);
    vm.expectRevert(ISafetyNet.InvalidContestWindow.selector);
    _sn.setContestWindow(_snId, 5 days);
  }

  function test_increaseContestWindow_thenVotingWindowMustIncreaseToo() public {
    // Increase contestWindow to 7 days (equal to current votingWindow — valid)
    vm.prank(_owner);
    _sn.setContestWindow(_snId, 7 days);

    // Now reduce votingWindow below contestWindow — should revert
    vm.prank(_owner);
    vm.expectRevert(ISafetyNet.InvalidVotingWindow.selector);
    _sn.setVotingWindow(_snId, 5 days);
  }
}
