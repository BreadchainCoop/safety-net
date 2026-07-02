// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ProxyAdmin} from '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {stdError} from 'forge-std/StdError.sol';
import {Test} from 'forge-std/Test.sol';

import {InviteGenerator} from 'script/InviteGenerator.sol';
import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';
import {MockERC20} from 'test/mocks/MockERC20.sol';

contract FailERC20 {
  string public name = 'FailERC20';
  string public symbol = 'FAIL';
  uint8 public decimals = 18;

  function transfer(address, uint256) external pure returns (bool) {
    return false;
  }

  function transferFrom(address, address, uint256) external pure returns (bool) {
    return false;
  }
}

abstract contract SafetyNetUnitBase is Test {
  SafetyNet internal _sn;
  MockERC20 internal _token;
  FailERC20 internal _failToken;
  InviteGenerator internal _inviteGenerator;
  string internal constant _INVITE_SIGNING_DOMAIN = 'SafetyNetInvite';
  string internal constant _INVITE_SIGNATURE_VERSION = '1';
  uint256 internal constant _CHAIN_ID = 1;
  string internal constant _REQUEST_SIGNING_DOMAIN = 'SafetyNetRequest';
  string internal constant _REQUEST_SIGNATURE_VERSION = '1';
  bytes32 internal constant _REQUEST_AUTHORIZATION_TYPEHASH =
    keccak256('RequestAuthorization(uint256 safetyNetId,uint256 amount,uint256 nonce,uint256 deadline)');
  bytes32 internal constant _EIP712_DOMAIN_TYPEHASH =
    keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');

  address internal _owner;
  uint256 internal _ownerKey;
  address internal _impostor;
  uint256 internal _impostorKey;
  address internal _requester;
  uint256 internal _requesterKey;
  address internal _alice = makeAddr('alice');
  address internal _bob = makeAddr('bob');
  address internal _carol = makeAddr('carol');
  address internal _dave = makeAddr('dave');

  function setUp() public {
    (_owner, _ownerKey) = makeAddrAndKey('owner');
    (_impostor, _impostorKey) = makeAddrAndKey('impostor');
    (_requester, _requesterKey) = makeAddrAndKey('requester');
    // Deploy upgradeable proxy and initialize owner to match tests
    address impl = address(new SafetyNet());
    address admin = address(new ProxyAdmin(_owner));
    address proxy = address(new TransparentUpgradeableProxy(impl, admin, abi.encodeWithSelector(SafetyNet.initialize.selector, _owner)));
    _sn = SafetyNet(proxy);
    _token = new MockERC20('Mock', 'MOCK');
    _failToken = new FailERC20();
    _inviteGenerator = new InviteGenerator(_INVITE_SIGNING_DOMAIN, _INVITE_SIGNATURE_VERSION, 'safetyNet');

    // Fund members with ample tokens
    _token.mint(_alice, 1_000_000 ether);
    _token.mint(_bob, 1_000_000 ether);
    _token.mint(_carol, 1_000_000 ether);

    // Approve SafetyNet to pull funds
    vm.startPrank(_alice);
    _token.approve(address(_sn), type(uint256).max);
    vm.stopPrank();
    vm.startPrank(_bob);
    _token.approve(address(_sn), type(uint256).max);
    vm.stopPrank();
    vm.startPrank(_carol);
    _token.approve(address(_sn), type(uint256).max);
    vm.stopPrank();
  }

  // ---------- helpers ----------
  function _defaultSafetyNet(address _tokenAddr) internal view returns (ISafetyNet.SafetyNet memory _safetyNet) {
    address[] memory members = new address[](2);
    members[0] = _alice;
    members[1] = _bob;
    _safetyNet = ISafetyNet.SafetyNet({
      id: 0,
      owner: _owner,
      minimumMembers: 2,
      maximumMembers: 5,
      contestThreshold: 33,
      safetyNetStart: block.timestamp,
      token: _tokenAddr,
      members: members,
      initialDeposit: 100 ether,
      fixedDeposit: 10 ether,
      redeemRatio: 1,
      autoThreshold: 50 ether,
      contestWindow: 3 days,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });
  }

  function _fullSafetyNet(address _tokenAddr) internal view returns (ISafetyNet.SafetyNet memory _safetyNet) {
    address[] memory members = new address[](2);
    members[0] = _alice;
    members[1] = _bob;
    _safetyNet = ISafetyNet.SafetyNet({
      id: 0,
      owner: _owner,
      minimumMembers: 2,
      maximumMembers: 2,
      contestThreshold: 33,
      safetyNetStart: block.timestamp,
      token: _tokenAddr,
      members: members,
      initialDeposit: 100 ether,
      fixedDeposit: 10 ether,
      redeemRatio: 1,
      autoThreshold: 50 ether,
      contestWindow: 3 days,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });
  }

  function _allowToken(address tkn) internal {
    vm.prank(_owner);
    _sn.setTokenAllowed(tkn, true);
  }

  function _payInitial(uint256 id, address who) internal {
    ISafetyNet.SafetyNet memory _safetyNet = _sn.getSafetyNet(id);
    vm.prank(who);
    _sn.deposit(id, _safetyNet.initialDeposit);
  }

  function _nextEpoch(uint256 id) internal {
    ISafetyNet.SafetyNet memory _safetyNet = _sn.getSafetyNet(id);
    vm.warp(_safetyNet.safetyNetStart + _safetyNet.epochDuration);
  }

  function _createFundAndRequest() internal returns (uint256 id, uint256 reqId) {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));

    // Ensure withdraw goes through request path
    _safetyNet.autoThreshold = 1;
    id = _sn.create(_safetyNet);
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    // Create request via withdraw above threshold
    vm.prank(_alice);

    // Large enough for request
    _sn.withdraw(id, 2);
    reqId = 0;
  }

  function _signRequestAuthorization(
    uint256 _privateKey,
    uint256 _safetyNetId,
    uint256 _amount,
    uint256 _nonce,
    uint256 _deadline
  ) internal view returns (bytes memory) {
    bytes32 structHash = keccak256(abi.encode(_REQUEST_AUTHORIZATION_TYPEHASH, _safetyNetId, _amount, _nonce, _deadline));
    bytes32 domainSeparator = keccak256(
      abi.encode(
        _EIP712_DOMAIN_TYPEHASH,
        keccak256(bytes(_REQUEST_SIGNING_DOMAIN)),
        keccak256(bytes(_REQUEST_SIGNATURE_VERSION)),
        block.chainid,
        address(_sn)
      )
    );
    bytes32 digest = keccak256(abi.encodePacked('\x19\x01', domainSeparator, structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(_privateKey, digest);
    return abi.encodePacked(r, s, v);
  }

  function _safetyNetWithRequester(address _tokenAddr) internal view returns (ISafetyNet.SafetyNet memory _safetyNet) {
    _safetyNet = _defaultSafetyNet(_tokenAddr);
    address[] memory members = new address[](3);
    members[0] = _alice;
    members[1] = _bob;
    members[2] = _requester;
    _safetyNet.members = members;
  }

  function _requestFor(uint256 _safetyNetId, address _reqOwner, uint256 _amount) internal pure returns (ISafetyNet.Request memory) {
    return ISafetyNet.Request({owner: _reqOwner, safetyNetId: _safetyNetId, timestamp: 0, contestCount: 0, amount: _amount});
  }
}

contract SafetyNetUnit is SafetyNetUnitBase {
  // ---------- initialize ----------
  function test_InitializeWhenAlreadyInitialized() external {
    vm.expectRevert(abi.encodeWithSignature('InvalidInitialization()'));
    _sn.initialize(_owner);
  }

  function test_InitializeWhenNotInitialized() external {
    // Deploy fresh proxy and initialize successfully
    SafetyNet fresh = SafetyNet(
      address(
        new TransparentUpgradeableProxy(
          address(new SafetyNet()), address(new ProxyAdmin(_alice)), abi.encodeWithSelector(SafetyNet.initialize.selector, _alice)
        )
      )
    );

    // Owner set
    assertEq(fresh.owner(), _alice);

    // Cannot initialize twice
    vm.expectRevert(abi.encodeWithSignature('InvalidInitialization()'));
    fresh.initialize(_alice);
  }

  // ---------- setTokenAllowed ----------
  function test_SetTokenAllowedWhenCallerIsNotOwner() external {
    vm.expectRevert(abi.encodeWithSignature('OwnableUnauthorizedAccount(address)', _alice));
    vm.prank(_alice);
    _sn.setTokenAllowed(address(_token), true);
  }

  function test_SetTokenAllowedWhenTokenAddressIsZero() external {
    vm.prank(_owner);
    _sn.setTokenAllowed(address(0), true);
    assertTrue(_sn.allowedTokens(address(0)));
  }

  function test_SetTokenAllowedWhenAllowingAToken() external {
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.TokenAllowed(address(_token), true);
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);
    assertTrue(_sn.allowedTokens(address(_token)));
  }

  function test_SetTokenAllowedWhenDisallowingAToken() external {
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.TokenAllowed(address(_token), false);
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), false);
    assertFalse(_sn.allowedTokens(address(_token)));
  }

  // ---------- create ----------
  function test_CreateWhenTokenIsNotInAllowedTokensMapping() external {
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    vm.expectRevert(ISafetyNet.TokenNotAllowed.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenSafetyNetStartTimeIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.safetyNetStart = 0;
    vm.expectRevert(ISafetyNet.InvalidSafetyNetStartTime.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenOwnerIsZeroAddress() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.owner = address(0);
    vm.expectRevert(ISafetyNet.InvalidOwner.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenInitialDepositIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.initialDeposit = 0;
    vm.expectRevert(ISafetyNet.InvalidInitialDeposit.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenFixedDepositIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.fixedDeposit = 0;
    vm.expectRevert(ISafetyNet.InvalidFixedDeposit.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenAutoThresholdIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.autoThreshold = 0;
    vm.expectRevert(ISafetyNet.InvalidThreshold.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenMinimumMembersIs0() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.minimumMembers = 0;
    vm.expectRevert(ISafetyNet.InvalidMinimumMembers.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenMinimumMembersIs1() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.minimumMembers = 1;
    vm.expectRevert(ISafetyNet.InvalidMinimumMembers.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenMaximumMembersEqualsMinimumMembers() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.maximumMembers = _safetyNet.minimumMembers;
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);
  }

  function test_CreateWhenMaximumMembersIsLessThanMinimumMembers() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.maximumMembers = 1;
    _safetyNet.minimumMembers = 2;
    vm.expectRevert(ISafetyNet.InvalidMaximumMembers.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenEpochDurationIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.epochDuration = 0;
    vm.expectRevert(ISafetyNet.InvalidEpochDuration.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenSmallWithdrawsLimitIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.smallWithdrawsLimit = 0;
    vm.expectRevert(ISafetyNet.InvalidSmallWithdrawsLimit.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenMembersArrayIsEmpty() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.members = new address[](0);
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);
    (address[] memory members,) = _sn.getMemberBalances(id);
    assertEq(members.length, 0);
  }

  function test_CreateWhenAnyMemberAddressIsZeroAddress() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.members[1] = address(0);
    vm.expectRevert(ISafetyNet.InvalidMemberAddress.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenMembersArrayContainsDuplicates() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));

    // Duplicate
    _safetyNet.members[1] = _alice;

    vm.expectRevert(ISafetyNet.DuplicateMember.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenContestThresholdIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.contestThreshold = 0;
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);
  }

  function test_CreateWhenContestThresholdIsGreaterThan100() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.contestThreshold = 150;
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);
  }

  function test_CreateWhenAllParametersAreValid() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    vm.expectEmit(true, false, false, true);
    emit ISafetyNet.SafetyNetCreated(
      0,
      _safetyNet.minimumMembers,
      _safetyNet.maximumMembers,
      _safetyNet.contestThreshold,
      _safetyNet.members,
      _safetyNet.token,
      _safetyNet.initialDeposit,
      _safetyNet.fixedDeposit,
      _safetyNet.redeemRatio,
      _safetyNet.autoThreshold,
      _safetyNet.epochDuration,
      _safetyNet.smallWithdrawsLimit
    );
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);

    // nextId increments
    assertEq(_sn.nextId(), 1);

    // Stored struct
    ISafetyNet.SafetyNet memory stored = _sn.getSafetyNet(id);
    assertEq(stored.owner, _safetyNet.owner);

    // Members mapping and reverse index
    assertTrue(_sn.isMember(id, _alice));
    assertTrue(_sn.isMember(id, _bob));
    uint256[] memory aIds = _sn.getMemberSafetyNets(_alice);
    uint256[] memory bIds = _sn.getMemberSafetyNets(_bob);
    assertEq(aIds.length, 1);
    assertEq(bIds.length, 1);
    assertEq(aIds[0], id);
    assertEq(bIds[0], id);
  }

  // ---------- decommission ----------
  function test_DecommissionWhenSafetyNetIsNotDecommissionable() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    vm.expectRevert(ISafetyNet.NotDecommissionable.selector);
    _sn.decommission(id);
  }

  // Create balances and decommission after marking a missed deposit
  function test_DecommissionWhenSafetyNetIsDecommissionable() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    // epoch 0: onboarding
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);
    vm.prank(_bob);
    _sn.deposit(id, _safetyNet.initialDeposit);

    // epoch 1: deliberately miss deposits
    vm.warp(_safetyNet.safetyNetStart + _safetyNet.epochDuration);

    // Seed balances
    vm.warp(_safetyNet.safetyNetStart + 2 * _safetyNet.epochDuration + 1);
    vm.prank(_alice);
    _sn.deposit(id, 5 ether);
    vm.prank(_bob);
    _sn.deposit(id, 5 ether);

    uint256 preBalanceAlice = _token.balanceOf(_alice);
    uint256 preBalanceBob = _token.balanceOf(_bob);
    uint256 withdrawableAlice = _sn.memberWithdrawableBalance(id, _alice);
    uint256 withdrawableBob = _sn.memberWithdrawableBalance(id, _bob);
    uint256 totalBalance = _sn.safetyNetBalance(id);

    vm.expectEmit(true, false, false, true);
    emit ISafetyNet.SafetyNetDecommissioned(id);
    _sn.decommission(id);

    // Struct deleted (getSafetyNet should revert for decommissioned entries)
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    _sn.getSafetyNet(id);

    // Remaining equally split
    uint256 remaining = totalBalance - withdrawableAlice - withdrawableBob;
    uint256 equalShare = remaining / 2;
    assertEq(_token.balanceOf(_alice), preBalanceAlice + withdrawableAlice + equalShare);
    assertEq(_token.balanceOf(_bob), preBalanceBob + withdrawableBob + equalShare);
  }

  // ---------- deposit ----------
  function test_DepositWhenSafetyNetOwnerIsZeroAddress() external {
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    vm.prank(_alice);
    _sn.deposit(999, 1 ether);
  }

  function test_DepositWhenCallerIsNotInIsMemberMapping() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    vm.expectRevert(ISafetyNet.NotMember.selector);
    vm.prank(_carol);
    _sn.deposit(id, 1 ether);
  }

  function test_DepositWhenDepositValueIsZero() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    vm.expectRevert(ISafetyNet.InvalidDepositAmount.selector);
    vm.prank(_alice);
    _sn.deposit(id, 0);
  }

  function test_DepositWhenCurrentTimeIsBeforeSafetyNetStartTime() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.safetyNetStart = block.timestamp + 1 days;
    uint256 id = _sn.create(_safetyNet);
    vm.expectRevert(ISafetyNet.DepositBeforeSafetyNetStart.selector);
    vm.prank(_alice);
    _sn.deposit(id, 1 ether);
  }

  function test_DepositWhenCurrentTimeEqualsSafetyNetStartTime() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    vm.warp(_safetyNet.safetyNetStart);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    assertEq(_sn.safetyNetBalance(id), _safetyNet.initialDeposit);
  }

  function test_DepositWhenMemberAlreadyDepositedInCurrentEpoch() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    _payInitial(id, _alice);
    _nextEpoch(id);

    // First partial deposit
    vm.prank(_alice);
    _sn.deposit(id, 1 ether);

    // Fill the rest of the epoch dues to exactly fixedDeposit (10 ether total)
    vm.prank(_alice);
    _sn.deposit(id, 9 ether);

    // Now any extra exceeds the epoch cap
    vm.expectRevert(ISafetyNet.ExceedsDepositAmount.selector);
    vm.prank(_alice);
    _sn.deposit(id, 1 ether);

    // Fully paid flag (derived) is now true
    assertTrue(_sn.hasMemberDepositedInEpoch(id, _alice, _sn.getCurrentEpochIndex(id)));
  }

  function test_DepositWhenTokenTransferFromFails() external {
    _allowToken(address(_failToken));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_failToken));
    uint256 id = _sn.create(_safetyNet);

    vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(_failToken)));
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);
  }

  function test_DepositWhenMakingFirstDeposit() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    uint256 expectedTotal = _safetyNet.initialDeposit;
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.FundsDeposited(id, _alice, expectedTotal);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    assertEq(_sn.safetyNetMemberContribute(id, _alice), _safetyNet.fixedDeposit);
    assertEq(_sn.safetyNetBalance(id), expectedTotal);
    assertEq(_sn.memberWithdrawableBalance(id, _alice), _safetyNet.initialDeposit * _safetyNet.redeemRatio);

    // epoch 0 is considered fully paid (>= fixedDeposit)
    uint256 epoch = _sn.getCurrentEpochIndex(id);
    assertTrue(_sn.hasMemberDepositedInEpoch(id, _alice, epoch));
  }

  function test_DepositWhenMakingSubsequentDeposits() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    _payInitial(id, _alice);
    _nextEpoch(id);

    uint256 value = 3 ether;
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.FundsDeposited(id, _alice, value);
    vm.prank(_alice);
    _sn.deposit(id, value);

    assertEq(_sn.safetyNetBalance(id), _safetyNet.initialDeposit + value);
    assertEq(_sn.safetyNetMemberContribute(id, _alice), _safetyNet.fixedDeposit);
    assertEq(_sn.memberWithdrawableBalance(id, _alice), (_safetyNet.initialDeposit + value) * _safetyNet.redeemRatio);
  }

  // ---------- depositFor ----------
  function test_DepositForWhenSafetyNetOwnerIsZeroAddress() external {
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    vm.prank(_alice);
    _sn.depositFor(1234, 1 ether, _alice);
  }

  function test_DepositForWhenTargetMemberIsNotInIsMemberMapping() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    vm.expectRevert(ISafetyNet.NotMember.selector);
    vm.prank(_alice);
    _sn.depositFor(id, 1 ether, _carol);
  }

  function test_DepositForWhenSenderIsNotAMember() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    vm.prank(_carol);
    _sn.depositFor(id, _safetyNet.initialDeposit, _alice);
    assertEq(_sn.safetyNetMemberContribute(id, _alice), _safetyNet.fixedDeposit);
  }

  function test_DepositForWhenDepositValueIsZero() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    vm.expectRevert(ISafetyNet.InvalidDepositAmount.selector);
    vm.prank(_alice);
    _sn.depositFor(id, 0, _alice);
  }

  function test_DepositForWhenCurrentTimeIsBeforeSafetyNetStartTime() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.safetyNetStart = block.timestamp + 1 days;
    uint256 id = _sn.create(_safetyNet);
    vm.expectRevert(ISafetyNet.DepositBeforeSafetyNetStart.selector);
    vm.prank(_alice);
    _sn.depositFor(id, 1 ether, _alice);
  }

  function test_DepositForWhenTargetMemberAlreadyDepositedInCurrentEpoch() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    vm.prank(_alice);
    _sn.depositFor(id, _safetyNet.initialDeposit, _alice);

    vm.warp(_safetyNet.safetyNetStart + _safetyNet.epochDuration + 1);

    vm.prank(_alice);
    _sn.depositFor(id, 6 ether, _alice);
    vm.prank(_bob);
    _sn.depositFor(id, 4 ether, _alice);

    vm.expectRevert(ISafetyNet.ExceedsDepositAmount.selector);
    vm.prank(_bob);
    _sn.depositFor(id, 1 ether, _alice);
  }

  function test_DepositForWhenTokenTransferFromFailsFromSender() external {
    _allowToken(address(_failToken));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_failToken));
    uint256 id = _sn.create(_safetyNet);

    vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(_failToken)));
    vm.prank(_alice);
    _sn.depositFor(id, _safetyNet.initialDeposit, _alice);
  }

  function test_DepositForWhenMakingFirstDepositForTargetMember() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    vm.prank(_bob);
    _sn.depositFor(id, _safetyNet.initialDeposit, _alice);
    assertEq(_sn.safetyNetMemberContribute(id, _alice), _safetyNet.fixedDeposit);
  }

  // ---------- withdraw ----------
  function test_WithdrawWhenSafetyNetOwnerIsZeroAddress() external {
    // With direct call on non-existent id, contract panics due to division by zero before NotCommissioned
    vm.expectRevert(stdError.divisionError);
    vm.prank(_alice);
    _sn.withdraw(999, 1);
  }

  function test_WithdrawWhenCallerIsNotInIsMemberMapping() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    vm.expectRevert(ISafetyNet.NotMember.selector);
    vm.prank(_carol);
    _sn.withdraw(id, 1);
  }

  function test_WithdrawWhenDaysRequestedIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    uint256 beforeBal = _token.balanceOf(_alice);
    vm.prank(_alice);
    _sn.withdraw(id, 0);

    // Zero transfer still emits and counts as small withdraw
    assertEq(_token.balanceOf(_alice), beforeBal);
    assertEq(_sn.smallWithdrawsCount(id, _sn.getCurrentEpochIndex(id), _alice), 1);
  }

  function test_WithdrawWhenRequestedWithdrawalAmountExceedsMemberWithdrawableBalance() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);
    vm.expectRevert(ISafetyNet.NotWithdrawable.selector);
    vm.prank(_alice);

    // Likely exceeds withdrawable
    _sn.withdraw(id, 301);
  }

  function test_WithdrawWhenWithdrawalAmountIsBelowThreshold() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));

    // Small path
    _safetyNet.autoThreshold = 100 ether;
    uint256 id = _sn.create(_safetyNet);
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    uint256 before = _token.balanceOf(_alice);
    vm.prank(_alice);
    _sn.withdraw(id, 1);
    assertGt(_token.balanceOf(_alice), before);
    assertLt(_sn.memberWithdrawableBalance(id, _alice), _safetyNet.initialDeposit * _safetyNet.redeemRatio);
  }

  function test_WithdrawWhenWithdrawalAmountIsAboveAutoThresholdCreatesRequest() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    // Any withdraw > 1 wei goes to request path
    _safetyNet.autoThreshold = 1;
    uint256 id = _sn.create(_safetyNet);
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    vm.prank(_alice);
    _sn.withdraw(id, 1);
    assertEq(_sn.nextIdRequest(), 1);
    (address reqOwner, uint256 reqSafetyNetId,,, uint256 rqAmount) = _sn.requests(0);
    assertEq(reqOwner, _alice);
    assertEq(reqSafetyNetId, id);
  }

  // ---------- CONTEST MECHANISM TESTS ----------

  function test_ContestValid() external {
    (, uint256 reqId) = _createFundAndRequest();

    // Bob is member, within contest window
    vm.prank(_bob);
    _sn.contest(reqId);

    (,,, uint256 contestCount,) = _sn.requests(reqId);
    assertEq(contestCount, 1);
  }

  function test_ContestIncrementsCounter() external {
    (, uint256 reqId) = _createFundAndRequest();

    // Bob contests
    vm.prank(_bob);
    _sn.contest(reqId);

    // Check if counter incremented to 1
    (,,, uint256 contestCount,) = _sn.requests(reqId);
    assertEq(contestCount, 1);

    // Check that hasContested mapping is updated correctly
    assertTrue(_sn.hasContested(reqId, _bob));
  }

  function test_ContestRevertsIfUserAlreadyContested() external {
    _allowToken(address(_token));

    // Create a SafetyNet with 5 members to prevent immediate veto on first contest
    address[] memory members = new address[](5);
    members[0] = _alice;
    members[1] = _bob;
    members[2] = _carol;
    members[3] = _dave;
    members[4] = makeAddr('eve');

    ISafetyNet.SafetyNet memory _safetyNet = ISafetyNet.SafetyNet({
      id: 0,
      owner: _owner,
      minimumMembers: 2,
      maximumMembers: 10,
      contestThreshold: 33,
      safetyNetStart: block.timestamp,
      token: address(_token),
      members: members,
      initialDeposit: 100 ether,
      fixedDeposit: 10 ether,
      redeemRatio: 1,
      autoThreshold: 1,
      contestWindow: 3 days,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });
    uint256 id = _sn.create(_safetyNet);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    vm.prank(_alice);
    _sn.withdraw(id, 2); // Withdraw > autoThreshold creates request
    uint256 reqId = 0;

    // Bob contests for the first time (1/5 = 20%, doesn't trigger veto)
    vm.prank(_bob);
    _sn.contest(reqId);

    // Bob tries to contest again maliciously (Sybil attack)
    vm.expectRevert(ISafetyNet.AlreadyContestedByMember.selector);
    vm.prank(_bob);
    _sn.contest(reqId);
  }

  function test_ContestTriggersVetoWhenThresholdExceeded() external {
    _allowToken(address(_token));

    // Create a SafetyNet with 4 members to test the math properly!
    // Threshold: (4 * 33) / 100 = 1. So it takes 2 contests to > 1.
    address[] memory members = new address[](4);
    members[0] = _alice;
    members[1] = _bob;
    members[2] = _carol;
    members[3] = _dave;

    ISafetyNet.SafetyNet memory _safetyNet = ISafetyNet.SafetyNet({
      id: 0,
      owner: _owner,
      minimumMembers: 2,
      maximumMembers: 5,
      contestThreshold: 33, // 33% threshold
      safetyNetStart: block.timestamp,
      token: address(_token),
      members: members,
      initialDeposit: 100 ether,
      fixedDeposit: 10 ether,
      redeemRatio: 1,
      autoThreshold: 1,
      contestWindow: 3 days,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });
    uint256 id = _sn.create(_safetyNet);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    vm.prank(_alice);
    _sn.withdraw(id, 1);
    uint256 reqId = 0;

    // Bob contests (Count = 1). 1 > 1 is False. Veto NOT triggered yet.
    vm.prank(_bob);
    _sn.contest(reqId);
    assertFalse(_sn.isVetoed(reqId));

    // Carol also contests (Count = 2). 2 > 1 is True!
    // This MUST trigger the veto and emit the event.
    vm.prank(_carol);
    vm.expectEmit(true, true, false, true, address(_sn)); // Explicitly pass the SafetyNet contract address.
    emit ISafetyNet.WithdrawalVetoed(reqId, _alice, block.timestamp);
    _sn.contest(reqId);

    // Assert the state is correctly updated
    assertTrue(_sn.isVetoed(reqId));
  }

  function test_ExecuteContestedWithdrawalWhenContestWindowIsStillOpen() external {
    (, uint256 reqId) = _createFundAndRequest();

    // Should do nothing while still within window and not contested
    _sn.executeContestedWithdrawal(reqId);
    assertFalse(_sn.isExecuted(reqId));
  }

  function test_ExecuteContestedWithdrawalWhenRequestIsContested() external {
    (, uint256 reqId) = _createFundAndRequest();
    vm.prank(_bob);
    _sn.contest(reqId);
    vm.warp(block.timestamp + 10 days);
    _sn.executeContestedWithdrawal(reqId);
    assertFalse(_sn.isExecuted(reqId));
  }

  function test_ExecuteContestedWithdrawalWhenContestWindowHasPassedAndRequestWasNotContested() external {
    (, uint256 reqId) = _createFundAndRequest();

    // Beyond window
    vm.warp(block.timestamp + 10 days);
    (address rqOwner,,,, uint256 rqAmount) = _sn.requests(reqId);
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.WithdrawalAutoExecuted(reqId, rqOwner, rqAmount);
    _sn.executeContestedWithdrawal(reqId);
    assertTrue(_sn.isExecuted(reqId));
  }

  // ---------- views ----------
  function test_IsTokenAllowedWhenTokenIsInAllowedTokensMappingWithTrueValue() external {
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);
    assertTrue(_sn.isTokenAllowed(address(_token)));
  }

  function test_IsTokenAllowedWhenTokenIsInAllowedTokensMappingWithFalseValue() external {
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), false);
    assertFalse(_sn.isTokenAllowed(address(_token)));
  }

  function test_IsTokenAllowedWhenTokenIsNotInAllowedTokensMapping() external view {
    assertFalse(_sn.isTokenAllowed(address(_token)));
  }

  function test_IsTokenAllowedWhenTokenAddressIsZero() external {
    vm.prank(_owner);
    _sn.setTokenAllowed(address(0), true);
    assertTrue(_sn.isTokenAllowed(address(0)));
  }

  function test_GetSafetyNetWhenSafetyNetDoesNotExist() external {
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    _sn.getSafetyNet(123);
  }

  function test_GetSafetyNetWhenSafetyNetExistsAndIsCommissioned() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    ISafetyNet.SafetyNet memory g = _sn.getSafetyNet(id);
    assertEq(g.owner, _safetyNet.owner);
  }

  function test_GetSafetyNetsWhenIdsArrayIsEmpty() external view {
    ISafetyNet.SafetyNet[] memory arr = _sn.getSafetyNets(new uint256[](0));
    assertEq(arr.length, 0);
  }

  function test_GetSafetyNetsWhenSomeIdsDoNotExist() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    uint256[] memory ids = new uint256[](3);
    ids[0] = id;
    ids[1] = 999;
    ids[2] = 1000;
    ISafetyNet.SafetyNet[] memory arr = _sn.getSafetyNets(ids);
    assertEq(arr.length, 3);
    assertEq(arr[0].owner, _owner);
    assertEq(arr[1].owner, address(0));
  }

  function test_GetMemberSafetyNetsWhenMemberHasNoSafetyNets() external view {
    uint256[] memory ids = _sn.getMemberSafetyNets(_carol);
    assertEq(ids.length, 0);
  }

  function test_GetMemberSafetyNetsWhenMemberHasSafetyNets() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    uint256[] memory ids = _sn.getMemberSafetyNets(_alice);
    assertEq(ids.length, 1);
    assertEq(ids[0], id);
  }

  function test_GetMemberBalancesWhenSafetyNetDoesNotExist() external {
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    _sn.getMemberBalances(42);
  }

  function test_GetMemberBalancesWhenSafetyNetExistsAndIsCommissioned() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    (address[] memory members, uint256[] memory balances) = _sn.getMemberBalances(id);
    assertEq(members.length, 2);
    assertEq(balances.length, 2);
    assertEq(balances[0], 0);
    assertEq(balances[1], 0);
  }

  function test_HasMemberDepositedInEpochWhenEpochMemberDepositsIsTrue() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);
    assertTrue(_sn.hasMemberDepositedInEpoch(id, _alice, _sn.getCurrentEpochIndex(id)));
  }

  function test_HasMemberDepositedInEpochWhenEpochMemberDepositsIsFalseOrUnset() external view {
    assertFalse(_sn.hasMemberDepositedInEpoch(0, _alice, 0));
  }

  function test_GetCurrentEpochIndexWhenCurrentTimeEdgeCases() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.safetyNetStart = block.timestamp + 1 days;
    uint256 id = _sn.create(_safetyNet);

    // Before start
    assertEq(_sn.getCurrentEpochIndex(id), 0);
    vm.warp(_safetyNet.safetyNetStart);

    // At start
    assertEq(_sn.getCurrentEpochIndex(id), 0);
    vm.warp(_safetyNet.safetyNetStart + 1);

    // Just after start
    assertEq(_sn.getCurrentEpochIndex(id), 0);
    vm.warp(_safetyNet.safetyNetStart + _safetyNet.epochDuration);

    // Exactly one epoch
    assertEq(_sn.getCurrentEpochIndex(id), 1);
    vm.warp(_safetyNet.safetyNetStart + 5 * _safetyNet.epochDuration + 10);
    assertEq(_sn.getCurrentEpochIndex(id), 5);
  }

  function test_IsDecommissionableWhenSafetyNetDoesNotExist() external view {
    assertTrue(_sn.isDecommissionable(999));
  }

  function test_IsDecommissionableWhenSafetyNetOwnerIsZeroAddress() external view {
    assertTrue(_sn.isDecommissionable(123));
  }

  function test_IsDecommissionableWhenCurrentEpochIndexIs0() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    assertFalse(_sn.isDecommissionable(id));
  }

  // ---------- invite  ----------
  function test_shouldRedeemInvite() external {
    vm.chainId(_CHAIN_ID);
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 nonce = 1;
    uint256 safetyNetId = _sn.create(_safetyNet);
    ISafetyNet.Invite memory invite = ISafetyNet.Invite(safetyNetId, nonce);

    vm.prank(_owner);
    bytes memory signature = _inviteGenerator.generateInvite(_ownerKey, safetyNetId, nonce, address(_sn));

    vm.prank(_carol);
    vm.expectEmit(true, true, false, true, address(_sn));
    emit ISafetyNet.InviteRedeemed(invite.safetyNetId, _carol);
    _sn.redeemInvite(invite, signature);
  }

  function test_rejectInvalidSigner() external {
    vm.chainId(_CHAIN_ID);
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 nonce = 1;
    uint256 safetyNetId = _sn.create(_safetyNet);
    ISafetyNet.Invite memory invite = ISafetyNet.Invite(safetyNetId, nonce);

    bytes memory signature = _inviteGenerator.generateInvite(_impostorKey, safetyNetId, nonce, address(_sn));

    vm.prank(_carol);
    vm.expectRevert(ISafetyNet.InvalidSigner.selector);
    _sn.redeemInvite(invite, signature);
  }

  function test_rejectAlreadyUsedInvite() external {
    vm.chainId(_CHAIN_ID);
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 nonce = 1;
    uint256 safetyNetId = _sn.create(_safetyNet);
    ISafetyNet.Invite memory invite = ISafetyNet.Invite(safetyNetId, nonce);

    vm.prank(_owner);
    bytes memory signature = _inviteGenerator.generateInvite(_ownerKey, safetyNetId, nonce, address(_sn));

    vm.prank(_carol);
    _sn.redeemInvite(invite, signature);

    vm.prank(_dave);
    vm.expectRevert(ISafetyNet.InviteAlreadyUsed.selector);
    _sn.redeemInvite(invite, signature);
  }

  function test_rejectAlreadyAMember() external {
    vm.chainId(_CHAIN_ID);
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 nonce = 1;
    uint256 safetyNetId = _sn.create(_safetyNet);
    ISafetyNet.Invite memory invite = ISafetyNet.Invite(safetyNetId, nonce);

    vm.prank(_owner);
    bytes memory signature = _inviteGenerator.generateInvite(_ownerKey, safetyNetId, nonce, address(_sn));

    vm.prank(_alice);
    vm.expectRevert(ISafetyNet.AlreadyMember.selector);
    _sn.redeemInvite(invite, signature);
  }

  function test_rejectIfSafetyNetIsFull() external {
    vm.chainId(_CHAIN_ID);
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _fullSafetyNet(address(_token));
    uint256 nonce = 1;
    uint256 safetyNetId = _sn.create(_safetyNet);
    ISafetyNet.Invite memory invite = ISafetyNet.Invite(safetyNetId, nonce);

    vm.prank(_owner);
    bytes memory signature = _inviteGenerator.generateInvite(_ownerKey, safetyNetId, nonce, address(_sn));

    vm.prank(_carol);
    vm.expectRevert(ISafetyNet.SafetyNetFull.selector);
    _sn.redeemInvite(invite, signature);
  }

  function test_rejectIfSafetyNetDoesNotExist() external {
    vm.chainId(_CHAIN_ID);
    _allowToken(address(_token));
    uint256 nonce = 1;
    uint256 safetyNetId = 999;
    ISafetyNet.Invite memory invite = ISafetyNet.Invite(safetyNetId, nonce);

    vm.prank(_owner);
    bytes memory signature = _inviteGenerator.generateInvite(_ownerKey, safetyNetId, nonce, address(_sn));

    vm.prank(_carol);
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    _sn.redeemInvite(invite, signature);
  }
}

contract SafetyNetSignatureAndViewsUnit is SafetyNetUnitBase {
  // ---------- createRequestWithSignature ----------
  function test_CreateRequestWithSignatureWhenSignatureIsValid() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 amount = 60 ether;
    uint256 nonce = 1;

    ISafetyNet.Request memory request = _requestFor(id, _requester, amount);

    // Garbage values must be overridden by the contract
    request.timestamp = 123_456;
    request.contestCount = 42;

    uint256 deadline = block.timestamp + 1 days;
    bytes memory signature = _signRequestAuthorization(_requesterKey, id, amount, nonce, deadline);

    // Anyone may submit (relayer pattern)
    vm.expectEmit(true, false, false, true, address(_sn));
    emit ISafetyNet.RequestCreated(0, _requester, block.timestamp, amount);
    vm.prank(_carol);
    uint256 reqId = _sn.createRequestWithSignature(request, nonce, deadline, signature);

    assertEq(reqId, 0);
    assertEq(_sn.nextIdRequest(), 1);
    assertTrue(_sn.usedRequestNonces(id, _requester, nonce));

    (address reqOwner, uint256 reqSafetyNetId, uint256 reqTimestamp, uint256 reqContestCount, uint256 reqAmount) = _sn.requests(reqId);
    assertEq(reqOwner, _requester);
    assertEq(reqSafetyNetId, id);
    assertEq(reqTimestamp, block.timestamp);
    assertEq(reqContestCount, 0);
    assertEq(reqAmount, amount);

    // Request is indexed under the Safety Net
    uint256[] memory requestIds = _sn.getSafetyNetRequestIds(id);
    assertEq(requestIds.length, 1);
    assertEq(requestIds[0], reqId);
  }

  function test_CreateRequestWithSignatureWhenSignerIsNotRequestOwner() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 amount = 60 ether;
    uint256 nonce = 1;

    ISafetyNet.Request memory request = _requestFor(id, _requester, amount);
    uint256 deadline = block.timestamp + 1 days;
    bytes memory signature = _signRequestAuthorization(_impostorKey, id, amount, nonce, deadline);

    vm.expectRevert(ISafetyNet.InvalidSigner.selector);
    vm.prank(_carol);
    _sn.createRequestWithSignature(request, nonce, deadline, signature);
  }

  function test_CreateRequestWithSignatureWhenSignatureCoversDifferentParameters() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 nonce = 1;

    // Signature authorizes 60 ether but the submitted request asks for more
    ISafetyNet.Request memory request = _requestFor(id, _requester, 61 ether);
    uint256 deadline = block.timestamp + 1 days;
    bytes memory signature = _signRequestAuthorization(_requesterKey, id, 60 ether, nonce, deadline);

    vm.expectRevert(ISafetyNet.InvalidSigner.selector);
    vm.prank(_carol);
    _sn.createRequestWithSignature(request, nonce, deadline, signature);
  }

  function test_CreateRequestWithSignatureWhenNonceIsReplayed() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 amount = 60 ether;
    uint256 nonce = 1;

    ISafetyNet.Request memory request = _requestFor(id, _requester, amount);
    uint256 deadline = block.timestamp + 1 days;
    bytes memory signature = _signRequestAuthorization(_requesterKey, id, amount, nonce, deadline);

    vm.prank(_carol);
    _sn.createRequestWithSignature(request, nonce, deadline, signature);

    vm.expectRevert(ISafetyNet.RequestNonceAlreadyUsed.selector);
    vm.prank(_dave);
    _sn.createRequestWithSignature(request, nonce, deadline, signature);
  }

  function test_CreateRequestWithSignatureWhenSameNonceIsUsedOnDifferentSafetyNets() external {
    _allowToken(address(_token));
    uint256 idA = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 idB = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 amount = 60 ether;
    uint256 nonce = 1;

    uint256 deadline = block.timestamp + 1 days;

    vm.prank(_carol);
    _sn.createRequestWithSignature(
      _requestFor(idA, _requester, amount), nonce, deadline, _signRequestAuthorization(_requesterKey, idA, amount, nonce, deadline)
    );

    // Nonces are tracked per (safetyNetId, owner), so the same nonce is valid on another Safety Net
    vm.prank(_carol);
    uint256 reqId = _sn.createRequestWithSignature(
      _requestFor(idB, _requester, amount), nonce, deadline, _signRequestAuthorization(_requesterKey, idB, amount, nonce, deadline)
    );
    assertEq(reqId, 1);
  }

  function test_CreateRequestWithSignatureWhenRequestOwnerIsNotAMember() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    uint256 amount = 60 ether;
    uint256 nonce = 1;

    // _requester signs their own request but is not a member of this Safety Net
    ISafetyNet.Request memory request = _requestFor(id, _requester, amount);
    uint256 deadline = block.timestamp + 1 days;
    bytes memory signature = _signRequestAuthorization(_requesterKey, id, amount, nonce, deadline);

    vm.expectRevert(ISafetyNet.NotMember.selector);
    vm.prank(_carol);
    _sn.createRequestWithSignature(request, nonce, deadline, signature);
  }

  function test_CreateRequestWithSignatureWhenAmountIsZero() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 nonce = 1;

    ISafetyNet.Request memory request = _requestFor(id, _requester, 0);
    uint256 deadline = block.timestamp + 1 days;
    bytes memory signature = _signRequestAuthorization(_requesterKey, id, 0, nonce, deadline);

    vm.expectRevert(ISafetyNet.InvalidAmountZero.selector);
    vm.prank(_carol);
    _sn.createRequestWithSignature(request, nonce, deadline, signature);
  }

  function test_CreateRequestWithSignatureWhenSafetyNetDoesNotExist() external {
    uint256 amount = 60 ether;
    uint256 nonce = 1;

    ISafetyNet.Request memory request = _requestFor(999, _requester, amount);
    uint256 deadline = block.timestamp + 1 days;
    bytes memory signature = _signRequestAuthorization(_requesterKey, 999, amount, nonce, deadline);

    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    vm.prank(_carol);
    _sn.createRequestWithSignature(request, nonce, deadline, signature);
  }

  function test_CreateRequestWithSignatureWhenDeadlineHasPassed() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 amount = 60 ether;
    uint256 nonce = 1;

    ISafetyNet.Request memory request = _requestFor(id, _requester, amount);
    uint256 deadline = block.timestamp + 1 days;
    bytes memory signature = _signRequestAuthorization(_requesterKey, id, amount, nonce, deadline);

    // One second past the deadline the authorization is no longer submittable
    vm.warp(deadline + 1);
    vm.expectRevert(ISafetyNet.AuthorizationExpired.selector);
    vm.prank(_carol);
    _sn.createRequestWithSignature(request, nonce, deadline, signature);
  }

  function test_CreateRequestWithSignatureWhenSubmittedExactlyAtDeadline() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 amount = 60 ether;
    uint256 nonce = 1;

    ISafetyNet.Request memory request = _requestFor(id, _requester, amount);
    uint256 deadline = block.timestamp + 1 days;
    bytes memory signature = _signRequestAuthorization(_requesterKey, id, amount, nonce, deadline);

    // Submitting exactly at the deadline is still valid
    vm.warp(deadline);
    vm.prank(_carol);
    uint256 reqId = _sn.createRequestWithSignature(request, nonce, deadline, signature);
    assertEq(reqId, 0);
  }

  function test_CreateRequestWithSignatureWhenDeadlineDiffersFromSignedDeadline() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 amount = 60 ether;
    uint256 nonce = 1;

    ISafetyNet.Request memory request = _requestFor(id, _requester, amount);
    bytes memory signature = _signRequestAuthorization(_requesterKey, id, amount, nonce, block.timestamp + 1 days);

    // Submitter cannot extend the deadline beyond what was signed
    vm.expectRevert(ISafetyNet.InvalidSigner.selector);
    vm.prank(_carol);
    _sn.createRequestWithSignature(request, nonce, block.timestamp + 30 days, signature);
  }

  // ---------- cancelRequestNonce ----------
  function test_CancelRequestNonceWhenNonceIsUnused() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 amount = 60 ether;
    uint256 nonce = 1;

    ISafetyNet.Request memory request = _requestFor(id, _requester, amount);
    uint256 deadline = block.timestamp + 1 days;
    bytes memory signature = _signRequestAuthorization(_requesterKey, id, amount, nonce, deadline);

    // The owner cancels their outstanding authorization
    vm.expectEmit(true, true, false, true, address(_sn));
    emit ISafetyNet.RequestNonceCancelled(id, _requester, nonce);
    vm.prank(_requester);
    _sn.cancelRequestNonce(id, nonce);

    assertTrue(_sn.usedRequestNonces(id, _requester, nonce));

    // The previously signed authorization can no longer be submitted
    vm.expectRevert(ISafetyNet.RequestNonceAlreadyUsed.selector);
    vm.prank(_carol);
    _sn.createRequestWithSignature(request, nonce, deadline, signature);
  }

  function test_CancelRequestNonceWhenNonceIsAlreadyUsed() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 nonce = 1;

    vm.prank(_requester);
    _sn.cancelRequestNonce(id, nonce);

    vm.expectRevert(ISafetyNet.RequestNonceAlreadyUsed.selector);
    vm.prank(_requester);
    _sn.cancelRequestNonce(id, nonce);
  }

  function test_CancelRequestNonceWhenCallerOnlyAffectsOwnNonceSpace() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_safetyNetWithRequester(address(_token)));
    uint256 amount = 60 ether;
    uint256 nonce = 1;

    // Carol cancelling `nonce` in her own space does not burn the requester's nonce
    vm.prank(_carol);
    _sn.cancelRequestNonce(id, nonce);

    uint256 deadline = block.timestamp + 1 days;
    bytes memory signature = _signRequestAuthorization(_requesterKey, id, amount, nonce, deadline);
    vm.prank(_carol);
    uint256 reqId = _sn.createRequestWithSignature(_requestFor(id, _requester, amount), nonce, deadline, signature);
    assertEq(reqId, 0);
  }

  // ---------- aggregated views ----------
  function test_GetMembersWhenSafetyNetExists() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));

    address[] memory members = _sn.getMembers(id);
    assertEq(members.length, 2);
    assertEq(members[0], _alice);
    assertEq(members[1], _bob);
  }

  function test_GetMembersWhenSafetyNetDoesNotExist() external view {
    address[] memory members = _sn.getMembers(999);
    assertEq(members.length, 0);
  }

  function test_GetSafetyNetRequestIdsWhenNoRequestsExist() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    assertEq(_sn.getSafetyNetRequestIds(id).length, 0);
    assertEq(_sn.getSafetyNetRequests(id).length, 0);
  }

  function test_GetSafetyNetRequestIdsWhenRequestsAreCreatedThroughAllPaths() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _safetyNetWithRequester(address(_token));

    // Force the withdraw path to create requests
    _safetyNet.autoThreshold = 1;
    uint256 id = _sn.create(_safetyNet);
    _payInitial(id, _alice);

    // Request 0 via withdraw
    vm.prank(_alice);
    _sn.withdraw(id, 2);

    // Request 1 via createRequest
    vm.prank(_alice);
    _sn.createRequest(_requestFor(id, _alice, 5 ether));

    // Request 2 via createRequestWithSignature
    uint256 deadline = block.timestamp + 1 days;
    vm.prank(_carol);
    _sn.createRequestWithSignature(
      _requestFor(id, _requester, 3 ether), 1, deadline, _signRequestAuthorization(_requesterKey, id, 3 ether, 1, deadline)
    );

    uint256[] memory requestIds = _sn.getSafetyNetRequestIds(id);
    assertEq(requestIds.length, 3);
    assertEq(requestIds[0], 0);
    assertEq(requestIds[1], 1);
    assertEq(requestIds[2], 2);
  }

  function test_GetSafetyNetRequestsWhenDerivingRequestStatus() external {
    (uint256 id, uint256 reqId) = _createFundAndRequest();

    // Within the contest window: contestable, not executable
    ISafetyNet.RequestView[] memory views = _sn.getSafetyNetRequests(id);
    assertEq(views.length, 1);
    assertEq(views[0].id, reqId);
    assertEq(views[0].request.owner, _alice);
    assertEq(views[0].request.safetyNetId, id);
    assertFalse(views[0].isVetoed);
    assertFalse(views[0].isExecuted);
    assertTrue(views[0].isContestable);
    assertFalse(views[0].isExecutable);

    // After the contest window: executable
    vm.warp(block.timestamp + 10 days);
    views = _sn.getSafetyNetRequests(id);
    assertFalse(views[0].isContestable);
    assertTrue(views[0].isExecutable);

    // After execution: executed, no longer executable
    _sn.executeContestedWithdrawal(reqId);
    views = _sn.getSafetyNetRequests(id);
    assertTrue(views[0].isExecuted);
    assertFalse(views[0].isExecutable);
  }

  function test_GetSafetyNetRequestsWhenRequestIsVetoed() external {
    (uint256 id, uint256 reqId) = _createFundAndRequest();

    // 2 members, threshold 33%: a single contest exceeds the threshold and vetoes
    vm.prank(_bob);
    _sn.contest(reqId);
    assertTrue(_sn.isVetoed(reqId));

    // Still inside the time window: a vetoed request is no longer contestable (contest() would revert)
    ISafetyNet.RequestView[] memory views = _sn.getSafetyNetRequests(id);
    assertTrue(views[0].isVetoed);
    assertFalse(views[0].isContestable);
    assertFalse(views[0].isExecutable);

    vm.warp(block.timestamp + 10 days);
    views = _sn.getSafetyNetRequests(id);
    assertTrue(views[0].isVetoed);
    assertFalse(views[0].isExecuted);
    assertFalse(views[0].isContestable);
    assertFalse(views[0].isExecutable);
  }

  function test_GetSafetyNetRequestsWhenOwnerBalanceIsInsufficient() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    _payInitial(id, _alice);

    // Request more than Alice's withdrawable balance (100 ether at redeemRatio 1)
    vm.prank(_alice);
    _sn.createRequest(_requestFor(id, _alice, 200 ether));

    // Past the contest window, execution would revert on balance, so it must not be flagged executable
    vm.warp(block.timestamp + 10 days);
    ISafetyNet.RequestView[] memory views = _sn.getSafetyNetRequests(id);
    assertFalse(views[0].isVetoed);
    assertFalse(views[0].isExecuted);
    assertFalse(views[0].isContestable);
    assertFalse(views[0].isExecutable);
  }

  function test_GetSafetyNetRequestsWhenSafetyNetIsDecommissioned() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));

    // Force the withdraw path to create a request
    _safetyNet.autoThreshold = 1;
    uint256 id = _sn.create(_safetyNet);
    _payInitial(id, _alice);
    _payInitial(id, _bob);
    vm.prank(_alice);
    _sn.withdraw(id, 2);

    // Skip an epoch so the Safety Net becomes decommissionable, then decommission it
    vm.warp(_safetyNet.safetyNetStart + 2 * _safetyNet.epochDuration + 1);
    _sn.decommission(id);

    // The request survives in storage but must not be flagged executable on a decommissioned net
    ISafetyNet.RequestView[] memory views = _sn.getSafetyNetRequests(id);
    assertEq(views.length, 1);
    assertFalse(views[0].isContestable);
    assertFalse(views[0].isExecutable);
  }

  function test_GetSafetyNetDetailsWhenMemberIsQueried() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));

    // Force the withdraw path to create a request
    _safetyNet.autoThreshold = 1;
    uint256 id = _sn.create(_safetyNet);
    _payInitial(id, _alice);
    vm.prank(_alice);
    _sn.withdraw(id, 2);

    ISafetyNet.SafetyNetDetails memory details = _sn.getSafetyNetDetails(id, _alice);
    assertEq(details.safetyNet.id, id);
    assertEq(details.safetyNet.owner, _owner);
    assertEq(details.totalBalance, _safetyNet.initialDeposit);
    assertEq(details.memberCount, 2);
    assertTrue(details.isMember);
    assertEq(details.withdrawableBalance, _sn.memberWithdrawableBalance(id, _alice));
    assertEq(details.monthlyContribute, _safetyNet.fixedDeposit);

    // Alice paid the initial deposit which covers epoch 0 dues
    assertEq(details.duesRemaining, 0);
    assertEq(details.currentEpochIndex, 0);
    assertFalse(details.isDecommissionable);
    assertEq(details.requests.length, 1);
    assertEq(details.requests[0].request.owner, _alice);

    // Bob has not deposited yet, so he owes the full fixed deposit
    ISafetyNet.SafetyNetDetails memory bobDetails = _sn.getSafetyNetDetails(id, _bob);
    assertEq(bobDetails.duesRemaining, _safetyNet.fixedDeposit);
    assertEq(bobDetails.withdrawableBalance, 0);
    assertEq(bobDetails.monthlyContribute, 0);
  }

  function test_GetSafetyNetDetailsWhenQueriedAddressIsNotAMember() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));

    ISafetyNet.SafetyNetDetails memory details = _sn.getSafetyNetDetails(id, _carol);
    assertFalse(details.isMember);
    assertEq(details.withdrawableBalance, 0);
    assertEq(details.monthlyContribute, 0);
  }

  function test_GetSafetyNetDetailsWhenSafetyNetIsDecommissioned() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    _payInitial(id, _alice);
    _payInitial(id, _bob);

    // Skip an epoch to make the Safety Net decommissionable, then decommission
    vm.warp(_safetyNet.safetyNetStart + 2 * _safetyNet.epochDuration + 1);
    _sn.decommission(id);

    // Must not revert nor panic for decommissioned Safety Nets
    ISafetyNet.SafetyNetDetails memory details = _sn.getSafetyNetDetails(id, _alice);
    assertEq(details.safetyNet.owner, address(0));
    assertEq(details.totalBalance, 0);
    assertEq(details.memberCount, 0);
    assertEq(details.duesRemaining, 0);
    assertEq(details.currentEpochIndex, 0);
    assertTrue(details.isDecommissionable);
  }

  function test_GetMemberDashboardWhenMemberHasNoSafetyNets() external view {
    ISafetyNet.SafetyNetDetails[] memory dashboard = _sn.getMemberDashboard(_carol);
    assertEq(dashboard.length, 0);
  }

  function test_GetMemberDashboardWhenMemberHasMultipleSafetyNets() external {
    _allowToken(address(_token));
    uint256 idA = _sn.create(_defaultSafetyNet(address(_token)));
    uint256 idB = _sn.create(_defaultSafetyNet(address(_token)));

    _payInitial(idA, _alice);

    ISafetyNet.SafetyNetDetails[] memory dashboard = _sn.getMemberDashboard(_alice);
    assertEq(dashboard.length, 2);
    assertEq(dashboard[0].safetyNet.id, idA);
    assertEq(dashboard[1].safetyNet.id, idB);
    assertTrue(dashboard[0].isMember);
    assertTrue(dashboard[1].isMember);
    assertEq(dashboard[0].totalBalance, 100 ether);
    assertEq(dashboard[1].totalBalance, 0);
    assertEq(dashboard[0].duesRemaining, 0);
    assertEq(dashboard[1].duesRemaining, 10 ether);
  }
}
