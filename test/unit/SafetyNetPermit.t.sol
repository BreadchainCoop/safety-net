// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ProxyAdmin} from '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';
import {Test} from 'forge-std/Test.sol';
import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';
import {MockERC20Permit} from 'test/mocks/MockERC20Permit.sol';

contract SafetyNetPermit is Test {
  SafetyNet internal _sn;
  MockERC20Permit internal _token;
  address internal _owner;
  address internal _alice;
  uint256 internal _aliceKey;
  address internal _bob;
  uint256 internal _bobKey;

  function setUp() public {
    _owner = makeAddr('owner');
    (_alice, _aliceKey) = makeAddrAndKey('alice');
    (_bob, _bobKey) = makeAddrAndKey('bob');

    address impl = address(new SafetyNet());
    address admin = address(new ProxyAdmin(_owner));
    address proxy = address(
      new TransparentUpgradeableProxy(impl, admin, abi.encodeWithSelector(SafetyNet.initialize.selector, _owner))
    );
    _sn = SafetyNet(proxy);
    _token = new MockERC20Permit('Mock', 'MOCK');

    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);

    _token.mint(_alice, 1_000_000 ether);
    _token.mint(_bob, 1_000_000 ether);
  }

  function _buildSafetyNet() internal view returns (ISafetyNet.SafetyNet memory) {
    address[] memory members = new address[](2);
    members[0] = _alice;
    members[1] = _bob;
    return ISafetyNet.SafetyNet({
      id: 0, owner: _owner, minimumMembers: 2, maximumMembers: 5,
      consensusThreshold: 60, safetyNetStart: block.timestamp,
      token: address(_token), members: members,
      initialDeposit: 100 ether, fixedDeposit: 10 ether, redeemRatio: 1,
      autoThreshold: 50 ether, contestWindow: 3 days, votingWindow: 7 days,
      epochDuration: 30 days, smallWithdrawsLimit: 3
    });
  }

  function _getPermitSignature(uint256 key, address spender, uint256 amount, uint256 deadline) internal view returns (uint8 v, bytes32 r, bytes32 s) {
    address signer = vm.addr(key);
    bytes32 PERMIT_TYPEHASH = keccak256('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)');
    bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, signer, spender, amount, _token.nonces(signer), deadline));
    bytes32 digest = keccak256(abi.encodePacked('\x19\x01', _token.DOMAIN_SEPARATOR(), structHash));
    (v, r, s) = vm.sign(key, digest);
  }

  function test_DepositWithPermitOnboarding() external {
    uint256 id = _sn.create(_buildSafetyNet());
    uint256 deadline = block.timestamp + 1 hours;
    (uint8 v, bytes32 r, bytes32 s) = _getPermitSignature(_aliceKey, address(_sn), 100 ether, deadline);

    vm.prank(_alice);
    _sn.depositWithPermit(id, 100 ether, deadline, v, r, s);

    assertEq(_sn.safetyNetBalance(id), 100 ether);
    assertEq(_sn.memberWithdrawableBalance(id, _alice), 100 ether);
  }

  function test_DepositWithPermitRegular() external {
    uint256 id = _sn.create(_buildSafetyNet());

    vm.prank(_alice);
    _token.approve(address(_sn), type(uint256).max);
    vm.prank(_alice);
    _sn.deposit(id, 100 ether);

    ISafetyNet.SafetyNet memory sn = _sn.getSafetyNet(id);
    vm.warp(sn.safetyNetStart + sn.epochDuration);

    uint256 deadline = block.timestamp + 1 hours;
    (uint8 v, bytes32 r, bytes32 s) = _getPermitSignature(_aliceKey, address(_sn), 10 ether, deadline);

    vm.prank(_alice);
    _sn.depositWithPermit(id, 10 ether, deadline, v, r, s);

    assertEq(_sn.safetyNetBalance(id), 110 ether);
  }

  function test_DepositWithPermitExpiredDeadline() external {
    uint256 id = _sn.create(_buildSafetyNet());
    uint256 deadline = block.timestamp - 1;
    (uint8 v, bytes32 r, bytes32 s) = _getPermitSignature(_aliceKey, address(_sn), 100 ether, deadline);

    vm.expectRevert();
    vm.prank(_alice);
    _sn.depositWithPermit(id, 100 ether, deadline, v, r, s);
  }
}
