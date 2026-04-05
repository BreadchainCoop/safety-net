// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ProxyAdmin} from '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';
import {Test} from 'forge-std/Test.sol';

import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';
import {MockERC20} from 'test/mocks/MockERC20.sol';

/// @title SafetyNetLiquidity
/// @notice Tests for the explicit InsufficientPoolLiquidity guard added to _deduct() and the
///         small-withdrawal path in _withdraw().
///
/// Why the check is needed
/// -----------------------
/// Normal accounting keeps memberWithdrawableBalance <= safetyNetBalance, so the overflow guard
/// in _deduct/_withdraw should never fire in practice.  However if a bug, an admin action, or a
/// future upgrade ever de-synchronises the two balances the contract would previously emit an
/// opaque Panic(0x11) (arithmetic underflow).  The explicit check replaces that with the named
/// error InsufficientPoolLiquidity, making on-chain debugging and client-side error handling
/// straightforward.
///
/// Test strategy
/// -------------
/// We use vm.store to surgically zero-out safetyNetBalance[id] while leaving
/// memberWithdrawableBalance intact.  This simulates the de-synchronised state.
/// safetyNetBalance is a mapping(uint256 => uint256) at storage slot 8 in SafetyNet
/// (verified via: forge inspect src/contracts/SafetyNet.sol:SafetyNet storageLayout)
/// The storage key for safetyNetBalance[id] is keccak256(abi.encode(id, uint256(8))).
contract SafetyNetLiquidity is Test {
  // Storage slot of the safetyNetBalance mapping in SafetyNet (verified with forge inspect)
  uint256 internal constant _SAFETY_NET_BALANCE_SLOT = 7;

  SafetyNet internal _sn;
  MockERC20 internal _token;

  address internal _owner;
  address internal _alice = makeAddr('alice');
  address internal _bob = makeAddr('bob');

  function setUp() public {
    _owner = makeAddr('owner');
    _token = new MockERC20('Mock', 'MOCK');

    address impl = address(new SafetyNet());
    address admin = address(new ProxyAdmin(_owner));
    address proxy =
      address(new TransparentUpgradeableProxy(impl, admin, abi.encodeWithSelector(SafetyNet.initialize.selector, _owner)));
    _sn = SafetyNet(proxy);

    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);

    _token.mint(_alice, 1_000_000 ether);
    _token.mint(_bob, 1_000_000 ether);

    vm.prank(_alice);
    _token.approve(address(_sn), type(uint256).max);
    vm.prank(_bob);
    _token.approve(address(_sn), type(uint256).max);
  }

  function _buildSafetyNet() internal view returns (ISafetyNet.SafetyNet memory) {
    address[] memory members = new address[](2);
    members[0] = _alice;
    members[1] = _bob;
    return ISafetyNet.SafetyNet({
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
  }

  function _balanceSlot(uint256 id) internal pure returns (bytes32) {
    return keccak256(abi.encode(id, _SAFETY_NET_BALANCE_SLOT));
  }

  // ---------- regression: normal small withdrawal still works ----------

  function test_SmallWithdrawal_Succeeds_NormalFlow() external {
    vm.prank(_owner);
    uint256 id = _sn.create(_buildSafetyNet());

    vm.prank(_alice);
    _sn.deposit(id, 100 ether);
    vm.prank(_bob);
    _sn.deposit(id, 100 ether);

    ISafetyNet.SafetyNet memory sn = _sn.getSafetyNet(id);
    vm.warp(sn.safetyNetStart + sn.epochDuration);

    vm.prank(_alice);
    _sn.deposit(id, 10 ether);

    uint256 aliceWithdrawable = _sn.memberWithdrawableBalance(id, _alice);
    assertGt(aliceWithdrawable, 0, 'alice should have withdrawable balance');

    uint256 balanceBefore = _token.balanceOf(_alice);
    vm.prank(_alice);
    _sn.withdraw(id, 1);
    assertGt(_token.balanceOf(_alice), balanceBefore, 'alice should have received tokens');
  }

  // ---------- InsufficientPoolLiquidity: small withdrawal path ----------

  function test_SmallWithdrawal_RevertsInsufficientPoolLiquidity_WhenBalanceZeroed() external {
    vm.prank(_owner);
    uint256 id = _sn.create(_buildSafetyNet());

    vm.prank(_alice);
    _sn.deposit(id, 100 ether);
    vm.prank(_bob);
    _sn.deposit(id, 100 ether);

    ISafetyNet.SafetyNet memory sn = _sn.getSafetyNet(id);
    vm.warp(sn.safetyNetStart + sn.epochDuration);

    vm.prank(_alice);
    _sn.deposit(id, 10 ether);

    uint256 aliceWithdrawable = _sn.memberWithdrawableBalance(id, _alice);
    assertGt(aliceWithdrawable, 0, 'setup: alice must have withdrawable balance');

    // Artificially zero the pool balance to simulate de-synchronised accounting
    vm.store(address(_sn), _balanceSlot(id), bytes32(0));
    assertEq(_sn.safetyNetBalance(id), 0, 'setup: pool balance should be 0 after vm.store');

    // Must revert with InsufficientPoolLiquidity, not an opaque Panic(0x11)
    vm.expectRevert(abi.encodeWithSignature('InsufficientPoolLiquidity()'));
    vm.prank(_alice);
    _sn.withdraw(id, 1);
  }

  // ---------- InsufficientPoolLiquidity: _deduct path (large withdrawal execution) ----------

  function test_ExecuteWithdrawal_RevertsInsufficientPoolLiquidity_WhenBalanceZeroed() external {
    ISafetyNet.SafetyNet memory cfg = _buildSafetyNet();
    cfg.autoThreshold = 1 wei; // force large-withdrawal path

    vm.prank(_owner);
    uint256 id = _sn.create(cfg);

    vm.prank(_alice);
    _sn.deposit(id, 100 ether);
    vm.prank(_bob);
    _sn.deposit(id, 100 ether);

    ISafetyNet.SafetyNet memory sn = _sn.getSafetyNet(id);
    vm.warp(sn.safetyNetStart + sn.epochDuration);

    vm.prank(_alice);
    _sn.deposit(id, 10 ether);

    assertGt(_sn.memberWithdrawableBalance(id, _alice), 0, 'setup: alice must have withdrawable balance');

    // Submit large withdrawal request
    vm.prank(_alice);
    _sn.withdraw(id, 1);
    uint256 requestId = _sn.nextIdRequest() - 1;

    // Advance past voting window
    vm.warp(block.timestamp + sn.votingWindow + 1);

    // Artificially zero the pool balance before execution
    vm.store(address(_sn), _balanceSlot(id), bytes32(0));
    assertEq(_sn.safetyNetBalance(id), 0, 'setup: pool balance should be 0 after vm.store');

    // executeWithdrawal calls _deduct which must revert with InsufficientPoolLiquidity
    vm.expectRevert(abi.encodeWithSignature('InsufficientPoolLiquidity()'));
    vm.prank(_alice);
    _sn.executeContestedWithdrawal(requestId);
  }
}
