// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {OwnableUpgradeable} from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';

import {ISafetyNet} from '../interfaces/ISafetyNet.sol';
import {ReentrancyGuard} from './utils/ReentrancyGuard.sol';

/// @title SafetyNet
/// @notice Simple implementation of a Broodfond for ERC20 tokens
/// @author @exo404
/// @author @valeriooconte
/// @author @RonTuretzky
/// @author @Fiuum1
contract SafetyNet is ISafetyNet, ReentrancyGuard, OwnableUpgradeable {
  using SafeERC20 for IERC20;

  /// @notice Number of days in a month (used for calculating monthly withdrawals)
  uint256 public constant DAYS_IN_A_MONTH = 30;

  /// @notice Minimum redeem (support) ratio — 1 is a pure savings circle: withdrawals 1:1 with deposits
  uint256 public constant MINIMUM_REDEEM_RATIO = 1;

  /// @notice Maximum redeem (support) ratio a Safety Net can be configured with
  /// @dev The Dutch Broodfonds convention is ~22x (EUR 33.75-112.50/month dues map to EUR 750-2,500/month
  ///      sickness support). 25 keeps that reachable with headroom while staying anchored to the
  ///      actuarial heuristic that one claimant's monthly benefit (dues x ratio) should be coverable
  ///      by one month of group dues — i.e. ratio <= member count — at the Broodfonds-recommended
  ///      minimum group size of 25. Ratios > 1 are solidarity leverage: claims exceed deposits and are
  ///      backed by the pool, so withdrawals are additionally throttled by {getEffectiveRedeemRatio}.
  uint256 public constant MAXIMUM_REDEEM_RATIO = 25;

  /*//////////////////////////////////////////////////////////////
                    ACTUARIAL RISK PARAMETERS
  //////////////////////////////////////////////////////////////*/

  /// @notice Basis-point denominator for the risk math
  uint256 public constant BPS = 10_000;

  /// @notice Expected share of members drawing support at any given time, in basis points (2%)
  /// @dev Calibration: Dutch Broodfondsen reported ~1% of 5,000+ participants sick at a time (2015,
  ///      with a 1-month waiting period and 2-year benefit cap); historical US industrial sickness
  ///      funds show ~2% of the work-year lost to compensated sickness (EH.net). 2% is the prudent
  ///      middle of that evidence for self-employed mutual sickness funds.
  uint256 public constant EXPECTED_SICK_SHARE_BPS = 200;

  /// @notice One-sided prudence factor z applied to the sick-share standard deviation, in centi-units (1.65)
  /// @dev Standard-deviation premium principle: required margin = z * sqrt(p(1-p)/N), shrinking with
  ///      group size N (law of large numbers). z = 1.65 targets ~5% ruin probability — the strict end
  ///      of the 5-10% first-year range regulators accept for new insurers — chosen because an onchain
  ///      fund has no Broodfonds-Alliance-style reinsurance backstop. (Broodfonds' own 22.2x at N = 50
  ///      corresponds to z ~= 1.28, the loose end of that range.)
  uint256 public constant RISK_LOADING_Z_CENTI = 165;

  /// @notice Months of a single claimant's support the pool must hold for full-rate withdrawals (6)
  /// @dev Reserve-adequacy throttle: a member's monthly support rate is capped at pool / 6, so young
  ///      funds pay out at reduced rates until the buffer builds (Broodfonds funds build buffers over
  ///      their first years; the average disability claim runs ~8 months, so 6 months of runway covers
  ///      the bulk of a typical claim before further dues arrive).
  uint256 public constant POOL_RUNWAY_MONTHS = 6;

  /// @notice Maximum number of future epochs a member can prepay beyond the current epoch
  /// @dev Bounds the deposit allocation loop in {_deposit}; roughly one year of monthly epochs
  uint256 public constant MAX_PREPAY_EPOCHS = 12;

  /// @notice Invite signing domain name used for EIP-712 signatures
  string private constant _INVITE_SIGNING_DOMAIN = 'SafetyNetInvite';

  /// @notice Invite signing version used for EIP-712 signatures
  string private constant _INVITE_SIGNATURE_VERSION = '1';

  /// @notice EIP-712 type hash for invite signatures
  bytes32 private constant _INVITE_TYPEHASH = keccak256('Invite(uint256 safetyNetId,uint256 nonce)');

  /// @notice EIP-712 domain type hash
  bytes32 private constant _EIP712_DOMAIN_TYPEHASH =
    keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');

  /// @notice Hashed domain name for invite signatures
  bytes32 private constant _INVITE_DOMAIN_NAME_HASH = keccak256(bytes(_INVITE_SIGNING_DOMAIN));

  /// @notice Hashed version for invite signatures
  bytes32 private constant _INVITE_DOMAIN_VERSION_HASH = keccak256(bytes(_INVITE_SIGNATURE_VERSION));

  /// @notice Request signing domain name used for EIP-712 signatures
  string private constant _REQUEST_SIGNING_DOMAIN = 'SafetyNetRequest';

  /// @notice Request signing version used for EIP-712 signatures
  string private constant _REQUEST_SIGNATURE_VERSION = '1';

  /// @notice EIP-712 type hash for request authorization signatures
  bytes32 private constant _REQUEST_AUTHORIZATION_TYPEHASH =
    keccak256('RequestAuthorization(uint256 safetyNetId,uint256 amount,uint256 nonce,uint256 deadline,string reason)');

  /// @notice Hashed domain name for request authorization signatures
  bytes32 private constant _REQUEST_DOMAIN_NAME_HASH = keccak256(bytes(_REQUEST_SIGNING_DOMAIN));

  /// @notice Hashed version for request authorization signatures
  bytes32 private constant _REQUEST_DOMAIN_VERSION_HASH = keccak256(bytes(_REQUEST_SIGNATURE_VERSION));

  /// @notice Base denominator used for percentage calculations
  uint256 public constant PERCENTAGE_BASE = 100;

  /// @notice Maximum byte length of a withdrawal request reason (~200 words; the UI enforces the word cap)
  uint256 public constant MAX_REASON_BYTES = 2000;

  /// @notice Maximum byte length of a Safety Net name
  uint256 public constant MAX_NAME_BYTES = 128;

  /// @notice ID counter used to assign unique identifiers to each Safety Net
  uint256 public nextId;

  /// @notice ID counter used to assign unique identifiers to each request
  uint256 public nextIdRequest;

  /// @notice Stores all created Safety Nets indexed by their unique ID
  mapping(uint256 id => SafetyNet safetyNet) public safetyNets;

  /// @notice Indicates whether a specific address is a member of the Safety Net with the given ID
  mapping(uint256 id => mapping(address member => bool status)) public isMember;

  /// @notice Lists all Safety Net IDs that a given member has joined
  mapping(address member => uint256[] ids) public memberSafetyNets;

  /// @notice Tracks personal savings of each member in a given Safety Net
  mapping(uint256 id => mapping(address member => uint256 monthlyContribute)) public safetyNetMemberContribute;

  /// @notice Tracks withdrawable amount for each member in a given Safety Net
  mapping(uint256 id => mapping(address member => uint256 withdrawableBalance)) public memberWithdrawableBalance;

  /// @notice Holds the total balance of each Safety Net
  mapping(uint256 id => uint256 balance) public safetyNetBalance;

  /// @notice Indicates whether a specific ERC20 token is allowed for use in Safety Nets
  mapping(address token => bool status) public allowedTokens;

  /// @notice Lists all requests indexed by their unique ID
  mapping(uint256 idReq => Request request) public requests;

  /// @notice Tracks if a request has been vetoed
  mapping(uint256 id => bool vetoed) public isVetoed;

  /// @notice Tracks if a request has been executed
  mapping(uint256 id => bool executed) public isExecuted;

  /// @notice Records if a member has already contested a specific request
  mapping(uint256 idReq => mapping(address member => bool status)) public hasContested;

  /// @notice Per-epoch cumulative amount deposited by a member (their own savings) toward the exact dues
  mapping(uint256 safetyNetId => mapping(uint256 epochIndex => mapping(address member => uint256))) public epochMemberDepositedAmount;

  /// @notice Tracks the number of small withdrawals performed in a Safety Net from a member during one epoch
  mapping(uint256 safetyNetId => mapping(uint256 epochIndex => mapping(address member => uint256 smallWithdrawsCount))) public
    smallWithdrawsCount;

  /// @notice Tracks used nonces for invites to prevent replay attacks
  mapping(uint256 safetyNetId => mapping(uint256 nonce => bool used)) public usedNonces;

  /// @notice Lists all request IDs created for a given Safety Net
  mapping(uint256 safetyNetId => uint256[] requestIds) internal _safetyNetRequestIds;

  /// @notice Tracks used request authorization nonces per Safety Net and owner to prevent replay attacks
  mapping(uint256 safetyNetId => mapping(address owner => mapping(uint256 nonce => bool used))) public usedRequestNonces;

  /// @notice Requester-supplied reason attached to each withdrawal request; empty string when none was provided
  mapping(uint256 requestId => string reason) public requestReasons;

  /// @inheritdoc ISafetyNet
  /// @dev Appended at the end of the storage layout to preserve the upgradeable proxy's byte layout.
  ///      Stored only when a non-empty name is provided at creation; empty string otherwise
  mapping(uint256 id => string name) public safetyNetNames;

  /// @dev Require that msg.sender is a member of the given Safety Net
  modifier onlyMemberOf(uint256 _safetyNetId) {
    _onlyMemberOf(_safetyNetId);
    _;
  }

  /// @dev The inherited plain (non-upgradeable) ReentrancyGuard is kept intentionally: its constructor
  ///      only presets the guard slot to 1 as a gas optimization, and behind a proxy the slot simply
  ///      starts at 0, which is functionally equivalent and safe. It is vendored under
  ///      `src/contracts/utils/` so its constructor can carry its own unsafe-allow annotation, since
  ///      upgrades-core cannot suppress constructor findings on parents inside node_modules.
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /// @inheritdoc ISafetyNet
  function initialize(address _owner) external override initializer {
    __Ownable_init_unchained(_owner);
  }

  /// @inheritdoc ISafetyNet
  function setTokenAllowed(address _token, bool _allowed) external override onlyOwner {
    allowedTokens[_token] = _allowed;
    emit TokenAllowed(_token, _allowed);
  }

  /// @inheritdoc ISafetyNet
  function create(string calldata _name, SafetyNet memory _safetyNet) external override nonReentrant returns (uint256 _id) {
    if (bytes(_name).length > MAX_NAME_BYTES) revert NameTooLong();

    _id = nextId++;

    if (safetyNets[_id].owner != address(0)) revert AlreadyExists();
    if (!allowedTokens[_safetyNet.token]) revert TokenNotAllowed();
    if (_safetyNet.safetyNetStart != 0) revert InvalidSafetyNetStartTime();
    if (_safetyNet.owner == address(0)) revert InvalidOwner();
    if (_safetyNet.members.length != 0) revert InvalidMembers();
    if (_safetyNet.initialDeposit <= 0) revert InvalidInitialDeposit();
    if (_safetyNet.fixedDeposit <= 0) revert InvalidFixedDeposit();
    if (_safetyNet.autoThreshold <= 0) revert InvalidThreshold();
    if (_safetyNet.minimumMembers < 2) revert InvalidMinimumMembers();
    if (_safetyNet.maximumMembers < _safetyNet.minimumMembers) revert InvalidMaximumMembers();
    if (_safetyNet.epochDuration == 0) revert InvalidEpochDuration();
    if (_safetyNet.smallWithdrawsLimit == 0) revert InvalidSmallWithdrawsLimit();
    if (_safetyNet.redeemRatio < MINIMUM_REDEEM_RATIO) revert InvalidRatio();
    if (_safetyNet.redeemRatio > MAXIMUM_REDEEM_RATIO) revert InvalidRatio();

    // The owner is the sole founding member; everyone else joins via invites before start()
    address[] memory _foundingMembers = new address[](1);
    _foundingMembers[0] = _safetyNet.owner;
    _safetyNet.members = _foundingMembers;

    isMember[_id][_safetyNet.owner] = true;
    memberSafetyNets[_safetyNet.owner].push(_id);

    _safetyNet.id = _id;
    safetyNets[_id] = _safetyNet;

    // Store the name only when non-empty to save gas; the getter returns "" otherwise
    if (bytes(_name).length > 0) {
      safetyNetNames[_id] = _name;
    }

    emit SafetyNetCreated(
      _id,
      _safetyNet.owner,
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
      _safetyNet.smallWithdrawsLimit,
      _name
    );
    return _id;
  }

  /// @inheritdoc ISafetyNet
  function start(uint256 _id) external override nonReentrant {
    SafetyNet storage _safetyNet = safetyNets[_id];

    if (_safetyNet.owner == address(0)) revert NotCommissioned();
    if (_safetyNet.safetyNetStart != 0) revert AlreadyActive();
    if (msg.sender != _safetyNet.owner) revert InvalidOwner();
    if (_safetyNet.members.length < _safetyNet.minimumMembers) revert NotEnoughMembers();

    _safetyNet.safetyNetStart = block.timestamp;

    emit SafetyNetStarted(_id, block.timestamp);
  }

  /// @inheritdoc ISafetyNet
  /// @dev Distributes the pool on wind-down. When the pool covers all withdrawable balances (always
  ///      true at redeemRatio 1, where claims equal net deposits), every member receives their full
  ///      withdrawable balance and any surplus is split evenly — identical to v1 behavior, with
  ///      floor-division dust retained by the contract. When claims exceed the pool (possible at
  ///      redeemRatio > 1, since claims are deposits x ratio), each member receives a pro-rata share
  ///      `pool x claim / totalClaims` (floored; dust retained) — the same pro-rata benefit cut
  ///      mutual sickness funds have historically applied under claim pressure.
  function decommission(uint256 _id) external override nonReentrant {
    SafetyNet memory _safetyNet = safetyNets[_id];
    uint256 _safetyNetMembersLength = _safetyNet.members.length;

    if (!isDecommissionable(_id)) revert NotDecommissionable();

    uint256 _balance = safetyNetBalance[_id];

    safetyNetBalance[_id] = 0;

    uint256 _totalWithdrawable;
    for (uint256 i = 0; i < _safetyNetMembersLength; i++) {
      _totalWithdrawable += memberWithdrawableBalance[_id][_safetyNet.members[i]];
    }

    if (_totalWithdrawable <= _balance) {
      // Covered: pay claims in full, then split any surplus evenly (dust stays in the contract)
      for (uint256 i = 0; i < _safetyNetMembersLength; i++) {
        address _member = _safetyNet.members[i];
        uint256 _amount = memberWithdrawableBalance[_id][_member];
        if (_amount > 0) {
          memberWithdrawableBalance[_id][_member] = 0;
          _balance -= _amount;

          IERC20(_safetyNet.token).safeTransfer(_member, _amount);
        }
      }

      if (_balance > 0) {
        uint256 _amount = _balance / _safetyNetMembersLength;

        for (uint256 i = 0; i < _safetyNetMembersLength; i++) {
          address _member = _safetyNet.members[i];
          IERC20(_safetyNet.token).safeTransfer(_member, _amount);
        }
      }
    } else {
      // Shortfall (only reachable at redeemRatio > 1): pro-rata by claim, dust stays in the contract
      emit SafetyNetShortfallDistributed(_id, _balance, _totalWithdrawable);

      for (uint256 i = 0; i < _safetyNetMembersLength; i++) {
        address _member = _safetyNet.members[i];
        uint256 _claim = memberWithdrawableBalance[_id][_member];
        if (_claim > 0) {
          memberWithdrawableBalance[_id][_member] = 0;
          uint256 _payout = Math.mulDiv(_balance, _claim, _totalWithdrawable);
          if (_payout > 0) {
            IERC20(_safetyNet.token).safeTransfer(_member, _payout);
          }
        }
      }
    }

    delete safetyNets[_id];

    emit SafetyNetDecommissioned(_id);
  }

  /// @inheritdoc ISafetyNet
  function deposit(uint256 _id, uint256 _value) external override nonReentrant {
    _deposit(_id, _value, msg.sender);
  }

  /// @inheritdoc ISafetyNet
  function depositFor(uint256 _id, uint256 _value, address _member) external override nonReentrant {
    _deposit(_id, _value, _member);
  }

  /// @inheritdoc ISafetyNet
  function redeemInvite(Invite calldata _invite, bytes calldata _signature) external override nonReentrant {
    SafetyNet storage _safetyNet = safetyNets[_invite.safetyNetId];

    if (_safetyNet.owner == address(0)) revert NotCommissioned();
    if (usedNonces[_invite.safetyNetId][_invite.nonce]) revert InviteAlreadyUsed();
    if (isMember[_invite.safetyNetId][msg.sender]) revert AlreadyMember();
    // Joining is only possible between creation and start()
    if (_safetyNet.safetyNetStart != 0) revert AlreadyActive();
    if (_safetyNet.members.length >= _safetyNet.maximumMembers) revert SafetyNetFull();

    bytes32 _digest = _hashInvite(_invite);
    address _signer = ECDSA.recover(_digest, _signature);

    if (_signer != _safetyNet.owner) revert InvalidSigner();

    usedNonces[_invite.safetyNetId][_invite.nonce] = true;
    isMember[_invite.safetyNetId][msg.sender] = true;
    memberSafetyNets[msg.sender].push(_invite.safetyNetId);
    _safetyNet.members.push(msg.sender);

    emit InviteRedeemed(_invite.safetyNetId, msg.sender);
  }

  /// @inheritdoc ISafetyNet
  function withdraw(uint256 _id, uint256 _daysRequested, string calldata _reason) external override nonReentrant {
    if (bytes(_reason).length > MAX_REASON_BYTES) revert ReasonTooLong();
    _withdraw(_id, msg.sender, _daysRequested, _reason);
  }

  /// @inheritdoc ISafetyNet
  function createRequest(
    Request memory _request,
    string calldata _reason
  ) external override onlyMemberOf(_request.safetyNetId) returns (uint256) {
    if (_request.owner != msg.sender) revert InvalidOwner();
    if (safetyNets[_request.safetyNetId].owner == address(0)) revert NotCommissioned();
    if (safetyNets[_request.safetyNetId].safetyNetStart == 0) revert NotActive();
    if (_request.amount == 0) revert InvalidAmountZero();
    if (bytes(_reason).length > MAX_REASON_BYTES) revert ReasonTooLong();

    _request.timestamp = block.timestamp;
    _request.contestCount = 0;

    return _createRequest(_request, _reason);
  }

  /// @inheritdoc ISafetyNet
  function createRequestWithSignature(
    Request memory _request,
    uint256 _nonce,
    uint256 _deadline,
    string calldata _reason,
    bytes calldata _signature
  ) external override returns (uint256) {
    if (safetyNets[_request.safetyNetId].owner == address(0)) revert NotCommissioned();
    if (safetyNets[_request.safetyNetId].safetyNetStart == 0) revert NotActive();
    if (!isMember[_request.safetyNetId][_request.owner]) revert NotMember();
    if (_request.amount == 0) revert InvalidAmountZero();
    if (block.timestamp > _deadline) revert AuthorizationExpired();
    if (bytes(_reason).length > MAX_REASON_BYTES) revert ReasonTooLong();
    if (usedRequestNonces[_request.safetyNetId][_request.owner][_nonce]) revert RequestNonceAlreadyUsed();

    bytes32 _digest = _hashRequestAuthorization(_request.safetyNetId, _request.amount, _nonce, _deadline, _reason);
    address _signer = ECDSA.recover(_digest, _signature);

    if (_signer != _request.owner) revert InvalidSigner();

    usedRequestNonces[_request.safetyNetId][_request.owner][_nonce] = true;

    _request.timestamp = block.timestamp;
    _request.contestCount = 0;

    return _createRequest(_request, _reason);
  }

  /// @inheritdoc ISafetyNet
  function cancelRequestNonce(uint256 _safetyNetId, uint256 _nonce) external override {
    if (usedRequestNonces[_safetyNetId][msg.sender][_nonce]) revert RequestNonceAlreadyUsed();

    usedRequestNonces[_safetyNetId][msg.sender][_nonce] = true;

    emit RequestNonceCancelled(_safetyNetId, msg.sender, _nonce);
  }

  /// @inheritdoc ISafetyNet
  function contest(uint256 _requestId) external override nonReentrant onlyMemberOf(requests[_requestId].safetyNetId) {
    Request storage _request = requests[_requestId];

    // Ensure the request exists before allowing it to be contested
    if (_request.owner == address(0)) revert InvalidAddressZero();

    if (!_isContestable(_requestId)) revert ContestWindowClosed();
    if (isVetoed[_requestId]) revert AlreadyVetoed();

    if (hasContested[_requestId][msg.sender]) revert AlreadyContestedByMember();

    hasContested[_requestId][msg.sender] = true; // Ensure each member can only contest the request once

    SafetyNet storage safetyNet = safetyNets[_request.safetyNetId];
    _request.contestCount++;

    uint256 memberCount = safetyNet.members.length;
    uint256 threshold = safetyNet.contestThreshold;

    emit WithdrawalContested(_requestId, _request.owner, block.timestamp);

    // Multiply contestCount by PERCENTAGE_BASE instead of dividing the
    // right-hand side, so integer truncation cannot lower the threshold.
    if (_request.contestCount * PERCENTAGE_BASE > memberCount * threshold) {
      isVetoed[_requestId] = true;
      // Vetoed because more than contestThreshold% of the members have contested
      emit WithdrawalVetoed(_requestId, _request.owner, block.timestamp);
    }
  }

  /// @inheritdoc ISafetyNet
  function executeContestedWithdrawal(uint256 _idRequest) external override nonReentrant {
    Request memory _request = requests[_idRequest];
    if (_request.amount == 0) revert InvalidAmountZero();
    if (_request.owner == address(0)) revert InvalidAddressZero();
    if (isExecuted[_idRequest]) revert AlreadyExecuted();

    SafetyNet storage safetyNet = safetyNets[_request.safetyNetId];

    // Can only auto-execute if contest window has passed and request was not vetoed
    if (!_isContestable(_idRequest) && !isVetoed[_idRequest]) {
      _deduct(_request.safetyNetId, _request.owner, _request.amount);

      isExecuted[_idRequest] = true;
      emit WithdrawalAutoExecuted(_idRequest, _request.owner, _request.amount);

      IERC20(safetyNet.token).safeTransfer(_request.owner, _request.amount);
    }
  }

  /// @inheritdoc ISafetyNet
  function isTokenAllowed(address _token) external view override returns (bool) {
    return allowedTokens[_token];
  }

  /// @inheritdoc ISafetyNet
  function getSafetyNet(uint256 _id) external view override returns (SafetyNet memory _safetyNet) {
    _safetyNet = safetyNets[_id];

    if (_isDecommissioned(_safetyNet)) revert NotCommissioned();
  }

  /// @inheritdoc ISafetyNet
  function getSafetyNets(uint256[] calldata _ids) external view override returns (SafetyNet[] memory _safetyNets) {
    _safetyNets = new SafetyNet[](_ids.length);

    for (uint256 i = 0; i < _ids.length; i++) {
      _safetyNets[i] = safetyNets[_ids[i]];
    }
  }

  /// @inheritdoc ISafetyNet
  function getMemberSafetyNets(address _member) external view override returns (uint256[] memory _ids) {
    return memberSafetyNets[_member];
  }

  /// @inheritdoc ISafetyNet
  function getMemberBalances(uint256 _id) external view override returns (address[] memory _members, uint256[] memory _balances) {
    SafetyNet memory _safetyNet = safetyNets[_id];

    if (_isDecommissioned(_safetyNet)) revert NotCommissioned();

    _balances = new uint256[](_safetyNet.members.length);
    for (uint256 i = 0; i < _safetyNet.members.length; i++) {
      _balances[i] = memberWithdrawableBalance[_id][_safetyNet.members[i]];
    }

    return (_safetyNet.members, _balances);
  }

  /// @inheritdoc ISafetyNet
  function getMembersNeedingDeposit(uint256 _id) external view override returns (address[] memory) {
    SafetyNet memory safetyNet = safetyNets[_id];
    // No dues exist for decommissioned or not-yet-started Safety Nets
    if (_isDecommissioned(safetyNet) || safetyNet.safetyNetStart == 0) {
      return new address[](0);
    }

    uint256 epochIndex = getCurrentEpochIndex(_id);
    uint256 target = safetyNet.fixedDeposit;

    address[] memory buf = new address[](safetyNet.members.length);
    uint256 count = 0;

    for (uint256 i = 0; i < safetyNet.members.length; i++) {
      address _member = safetyNet.members[i];
      if (epochMemberDepositedAmount[_id][epochIndex][_member] < target) {
        buf[count++] = _member;
      }
    }

    if (count == buf.length) {
      return buf;
    }

    address[] memory trimmed = new address[](count);
    for (uint256 i = 0; i < count; i++) {
      trimmed[i] = buf[i];
    }
    return trimmed;
  }

  /// @inheritdoc ISafetyNet
  function hasMemberDepositedInEpoch(uint256 _safetyNetId, address _member, uint256 _epochIndex) external view override returns (bool) {
    ISafetyNet.SafetyNet storage _safetyNet = safetyNets[_safetyNetId];
    if (_safetyNet.owner == address(0)) return false;
    return epochMemberDepositedAmount[_safetyNetId][_epochIndex][_member] >= _safetyNet.fixedDeposit;
  }

  /// @inheritdoc ISafetyNet
  function duesRemainingThisEpoch(uint256 _id, address _member) external view override returns (uint256) {
    // There are no dues before the Safety Net is started
    if (safetyNets[_id].safetyNetStart == 0) {
      return 0;
    }

    uint256 epochIndex = getCurrentEpochIndex(_id);
    uint256 paid = epochMemberDepositedAmount[_id][epochIndex][_member];
    uint256 target = safetyNets[_id].fixedDeposit;
    return paid >= target ? 0 : (target - paid);
  }

  /// @inheritdoc ISafetyNet
  function getCurrentEpochIndex(uint256 _safetyNetId) public view override returns (uint256) {
    SafetyNet memory safetyNet = safetyNets[_safetyNetId];

    // Not-yet-started Safety Nets (safetyNetStart == 0) have no epochs; this also avoids a
    // division-by-zero panic for nonexistent Safety Nets whose epochDuration is unset
    if (safetyNet.safetyNetStart == 0 || block.timestamp < safetyNet.safetyNetStart) {
      return 0;
    }

    return (block.timestamp - safetyNet.safetyNetStart) / safetyNet.epochDuration;
  }

  /// @inheritdoc ISafetyNet
  function isDecommissionable(uint256 _safetyNetId) public view override returns (bool) {
    SafetyNet memory safetyNet = safetyNets[_safetyNetId];

    if (safetyNet.owner == address(0)) {
      return true;
    }

    uint256 currentEpochIndex = getCurrentEpochIndex(_safetyNetId);

    for (uint256 epochIndex = 0; epochIndex < currentEpochIndex; epochIndex++) {
      for (uint256 i = 0; i < safetyNet.members.length; i++) {
        address _member = safetyNet.members[i];
        if (epochMemberDepositedAmount[_safetyNetId][epochIndex][_member] < safetyNet.fixedDeposit) {
          return true;
        }
      }
    }

    return false;
  }

  /// @inheritdoc ISafetyNet
  function getMembers(uint256 _id) external view override returns (address[] memory _members) {
    return safetyNets[_id].members;
  }

  /// @inheritdoc ISafetyNet
  function getSafetyNetRequestIds(uint256 _id) external view override returns (uint256[] memory _requestIds) {
    return _safetyNetRequestIds[_id];
  }

  /// @inheritdoc ISafetyNet
  function getSafetyNetRequests(uint256 _id) public view override returns (RequestView[] memory _requestViews) {
    uint256[] memory _requestIds = _safetyNetRequestIds[_id];
    _requestViews = new RequestView[](_requestIds.length);

    for (uint256 i = 0; i < _requestIds.length; i++) {
      _requestViews[i] = _buildRequestView(_requestIds[i]);
    }
  }

  /// @inheritdoc ISafetyNet
  function getSafetyNetDetails(uint256 _id, address _member) public view override returns (SafetyNetDetails memory _details) {
    SafetyNet memory _safetyNet = safetyNets[_id];
    bool _commissioned = !_isDecommissioned(_safetyNet);
    // Dues only accrue on commissioned Safety Nets that have been started
    bool _accruingDues = _commissioned && _safetyNet.safetyNetStart != 0;

    uint256 _currentEpochIndex = _commissioned ? getCurrentEpochIndex(_id) : 0;
    uint256 _paid = epochMemberDepositedAmount[_id][_currentEpochIndex][_member];
    uint256 _target = _safetyNet.fixedDeposit;

    _details = SafetyNetDetails({
      safetyNet: _safetyNet,
      totalBalance: safetyNetBalance[_id],
      memberCount: _safetyNet.members.length,
      isMember: isMember[_id][_member],
      withdrawableBalance: memberWithdrawableBalance[_id][_member],
      monthlyContribute: safetyNetMemberContribute[_id][_member],
      duesRemaining: (_accruingDues && _paid < _target) ? _target - _paid : 0,
      currentEpochIndex: _currentEpochIndex,
      isDecommissionable: isDecommissionable(_id),
      effectiveRedeemRatio: getEffectiveRedeemRatio(_id, _member),
      requests: getSafetyNetRequests(_id)
    });
  }

  /// @inheritdoc ISafetyNet
  function getMemberDashboard(address _member) external view override returns (SafetyNetDetails[] memory _dashboard) {
    uint256[] memory _ids = memberSafetyNets[_member];
    _dashboard = new SafetyNetDetails[](_ids.length);

    for (uint256 i = 0; i < _ids.length; i++) {
      _dashboard[i] = getSafetyNetDetails(_ids[i], _member);
    }
  }

  /**
   * @dev Make a deposit for monthly contribute
   *      If it's the first deposit, initialDeposit is the total amount
   *      After onboarding, partial deposits are allowed until the epoch sum == fixedDeposit,
   *      and any excess carries forward into future epochs (prepay): the current epoch's
   *      remaining dues are filled first, then the next epoch, and so on, up to
   *      `MAX_PREPAY_EPOCHS` epochs beyond the current one. Reverts with
   *      {ExceedsDepositAmount} if the value cannot be fully allocated within that window.
   *      The pool (`safetyNetBalance`) is credited the deposited value, while the member's
   *      withdrawable balance is credited `value x redeemRatio` — at ratio 1 deposits are fully
   *      backed; at higher ratios the excess is a solidarity claim on the shared pool, throttled
   *      at withdrawal time by {getEffectiveRedeemRatio} and settled pro-rata on decommission.
   */
  function _deposit(uint256 _id, uint256 _value, address _member) internal {
    SafetyNet storage _safetyNet = safetyNets[_id];

    if (_safetyNet.owner == address(0)) revert NotCommissioned();
    if (!isMember[_id][_member]) revert NotMember();
    // Deposits require a started Safety Net; the time comparison is kept as a defensive
    // guard even though start() always stamps a past-or-current timestamp
    if (_safetyNet.safetyNetStart == 0 || block.timestamp < _safetyNet.safetyNetStart) revert DepositBeforeSafetyNetStart();
    if (_value == 0) revert InvalidDepositAmount();

    uint256 epoch = getCurrentEpochIndex(_id);
    uint256 epochPaid = epochMemberDepositedAmount[_id][epoch][_member];
    // Onboarding status is derived: not onboarded if no monthly contribution set yet.
    bool onboarding = (safetyNetMemberContribute[_id][_member] == 0);

    if (onboarding) {
      uint256 initial = _safetyNet.initialDeposit;
      // First month: must be first payment in the epoch AND exactly initialDeposit (no partials/multi-tx)
      if (epochPaid != 0 || _value != initial) revert InvalidDepositAmount();

      safetyNetMemberContribute[_id][_member] = _safetyNet.fixedDeposit;

      // Set epoch paid to full initial
      epochMemberDepositedAmount[_id][epoch][_member] = initial;
    } else {
      // Subsequent months: fill the current epoch's remaining dues first, then carry any
      // excess into future epochs (prepay), bounded by MAX_PREPAY_EPOCHS ahead.
      uint256 _remaining = _value;
      uint256 _fixedDeposit = _safetyNet.fixedDeposit;
      uint256 _lastPrepayEpoch = epoch + MAX_PREPAY_EPOCHS;

      for (uint256 _targetEpoch = epoch; _remaining > 0; _targetEpoch++) {
        // Value cannot be fully allocated within the prepay window
        if (_targetEpoch > _lastPrepayEpoch) revert ExceedsDepositAmount();

        uint256 _paid = epochMemberDepositedAmount[_id][_targetEpoch][_member];
        if (_paid >= _fixedDeposit) continue;

        uint256 _fill = _fixedDeposit - _paid;
        if (_remaining < _fill) _fill = _remaining;

        epochMemberDepositedAmount[_id][_targetEpoch][_member] = _paid + _fill;
        _remaining -= _fill;
      }
    }

    safetyNetBalance[_id] += _value;
    memberWithdrawableBalance[_id][_member] += _value * _safetyNet.redeemRatio;

    IERC20(_safetyNet.token).safeTransferFrom(_member, address(this), _value);

    emit FundsDeposited(_id, _member, _value);
  }

  /**
   * @notice Create a request for withdrawal
   * @param _request The request to be created
   * @param _reason The requester-supplied reason; stored only when non-empty
   * @return _idRequest The ID of the created request
   */
  function _createRequest(Request memory _request, string memory _reason) internal returns (uint256) {
    uint256 _idRequest = nextIdRequest++;

    if (_request.owner == address(0)) revert InvalidAddressZero();
    if (requests[_idRequest].owner != address(0)) revert AlreadyExists();
    if (safetyNets[_request.safetyNetId].owner == address(0)) revert NotCommissioned();

    requests[_idRequest] = _request;
    _safetyNetRequestIds[_request.safetyNetId].push(_idRequest);

    if (bytes(_reason).length > 0) {
      requestReasons[_idRequest] = _reason;
    }

    emit RequestCreated(_idRequest, _request.safetyNetId, _request.owner, _request.timestamp, _request.amount, _reason);
    return _idRequest;
  }

  /**
   * @dev Make a withdrawal
   * @param _id The ID of the Safety Net
   * @param _member The address of the member making the withdrawal
   * @param _daysRequested The number of days for which the member is requesting a withdrawal
   * @param _reason The requester-supplied reason; stored and emitted only when a request is created
   * @notice If the requested amount is small, it is transferred directly to the member
   *         If the requested amount is large, a request is created for approval
   */
  function _withdraw(uint256 _id, address _member, uint256 _daysRequested, string calldata _reason) internal {
    SafetyNet memory _safetyNet = safetyNets[_id];
    uint256 currentEpochIndex = getCurrentEpochIndex(_id);
    if (_safetyNet.owner == address(0)) revert NotCommissioned();
    if (!isMember[_id][_member]) revert NotMember();
    if (_safetyNet.safetyNetStart == 0) revert NotActive();

    uint256 _dailyWithdrawableAmount = _getDailyWithdrawableAmount(_id, _member);

    uint256 _withdrawAmount = _dailyWithdrawableAmount * _daysRequested;

    if (_withdrawAmount > memberWithdrawableBalance[_id][_member]) revert NotWithdrawable();

    if (_isSmall(_safetyNet.autoThreshold, _withdrawAmount)) {
      smallWithdrawsCount[_id][currentEpochIndex][_member]++;
      if (smallWithdrawsCount[_id][currentEpochIndex][_member] > _safetyNet.smallWithdrawsLimit) {
        revert ExceedsSmallWithdrawalLimit();
      }
      _deduct(_id, _member, _withdrawAmount);
      IERC20(_safetyNet.token).safeTransfer(_member, _withdrawAmount);

      emit FundsWithdrawn(_id, _member, _withdrawAmount);
    } else {
      Request memory _request =
        Request({owner: _member, safetyNetId: _id, timestamp: block.timestamp, contestCount: 0, amount: _withdrawAmount});
      uint256 _idRequest = _createRequest(_request, _reason);
      emit WithdrawalPending(_idRequest, _member, _withdrawAmount);
    }
  }

  /// @dev Calculates the daily withdrawal for a member: monthly contribution x the member's current
  ///      EFFECTIVE support ratio (configured ratio throttled by the actuarial caps) / 30
  function _getDailyWithdrawableAmount(uint256 _id, address _member) internal view returns (uint256) {
    uint256 _memberContribute = safetyNetMemberContribute[_id][_member];
    uint256 _monthlyWithdrawalAmount = _memberContribute * getEffectiveRedeemRatio(_id, _member);
    return _monthlyWithdrawalAmount / DAYS_IN_A_MONTH;
  }

  /// @inheritdoc ISafetyNet
  function getEffectiveRedeemRatio(uint256 _id, address _member) public view override returns (uint256) {
    uint256 _configured = safetyNets[_id].redeemRatio;
    // A savings circle (ratio 1) is fully backed by deposits — never throttled. Also covers
    // nonexistent/decommissioned nets, whose zeroed struct reads ratio 0.
    if (_configured <= MINIMUM_REDEEM_RATIO) return _configured;

    // Group-size cap (law of large numbers): 1 / (p + z * sqrt(p(1-p)/N)), all in basis points.
    // sqrt(p_bps * (BPS - p_bps) / N) is the sick-share standard deviation expressed in bps.
    uint256 _n = safetyNets[_id].members.length;
    uint256 _loadingBps = (RISK_LOADING_Z_CENTI * Math.sqrt(EXPECTED_SICK_SHARE_BPS * (BPS - EXPECTED_SICK_SHARE_BPS) / _n)) / 100;
    uint256 _effective = Math.min(_configured, BPS / (EXPECTED_SICK_SHARE_BPS + _loadingBps));

    // Pool-coverage cap (reserve adequacy): the pool must hold POOL_RUNWAY_MONTHS months of this
    // member's support rate, so monthly support <= pool / POOL_RUNWAY_MONTHS.
    uint256 _contribute = safetyNetMemberContribute[_id][_member];
    if (_contribute > 0) {
      _effective = Math.min(_effective, safetyNetBalance[_id] / (POOL_RUNWAY_MONTHS * _contribute));
    }

    // The savings-circle floor is always solvent: at ratio 1 every claim is backed 1:1 by deposits
    return Math.max(_effective, MINIMUM_REDEEM_RATIO);
  }

  /// @dev Check if a request is contestable by comparing the current timestamp with the request's timestamp and the contest window
  function _isContestable(uint256 _idRequest) internal view returns (bool) {
    Request memory _request = requests[_idRequest];
    return block.timestamp <= (_request.timestamp + safetyNets[_request.safetyNetId].contestWindow);
  }

  /// @dev
  function _isSmall(uint256 _autoThreshold, uint256 _withdrawAmount) internal pure returns (bool) {
    return _withdrawAmount <= _autoThreshold;
  }

  /// @dev Reverts with {NotMember} if msg.sender is not a member of `_safetyNetId`.
  function _onlyMemberOf(uint256 _safetyNetId) internal view {
    if (!isMember[_safetyNetId][msg.sender]) revert NotMember();
  }

  /// @dev Return if a specified Safety Net is decommissioned by checking if an owner is set
  function _isDecommissioned(SafetyNet memory _safetyNet) internal pure returns (bool) {
    return _safetyNet.owner == address(0);
  }

  /// @dev Deducts `_amount` from a member’s withdrawable balance and the Safety Net’s total balance.
  ///      Reverts with `NotWithdrawable` if the member's balance is insufficient, and with
  ///      `InsufficientPoolFunds` if the pool cannot cover the payout (possible at redeemRatio > 1,
  ///      where withdrawable balances are leveraged claims). Every payout path routes through here,
  ///      so the pool can never underflow.
  function _deduct(uint256 _safetyNetId, address _member, uint256 _amount) internal {
    if (memberWithdrawableBalance[_safetyNetId][_member] < _amount) {
      revert NotWithdrawable();
    }
    if (safetyNetBalance[_safetyNetId] < _amount) {
      revert InsufficientPoolFunds();
    }
    memberWithdrawableBalance[_safetyNetId][_member] -= _amount;
    safetyNetBalance[_safetyNetId] -= _amount;
  }

  /// @dev Builds a {RequestView} with derived status for a given request ID
  function _buildRequestView(uint256 _requestId) internal view returns (RequestView memory _requestView) {
    Request memory _request = requests[_requestId];
    bool _exists = _request.owner != address(0);
    bool _windowOpen = _isContestable(_requestId);
    bool _vetoed = isVetoed[_requestId];
    bool _executed = isExecuted[_requestId];
    bool _commissioned = safetyNets[_request.safetyNetId].owner != address(0);
    // Mirrors _deduct: the member's claim AND the pool must both cover the amount, so the
    // frontend's Execute gating reflects the real execution rule
    bool _fundsAvailable = memberWithdrawableBalance[_request.safetyNetId][_request.owner] >= _request.amount
      && safetyNetBalance[_request.safetyNetId] >= _request.amount;

    _requestView = RequestView({
      id: _requestId,
      request: _request,
      isVetoed: _vetoed,
      isExecuted: _executed,
      isContestable: _exists && _windowOpen && !_vetoed,
      isExecutable: _exists && !_windowOpen && !_vetoed && !_executed && _commissioned && _fundsAvailable,
      reason: requestReasons[_requestId]
    });
  }

  /// @dev Builds the EIP-712 digest for a request authorization
  function _hashRequestAuthorization(
    uint256 _safetyNetId,
    uint256 _amount,
    uint256 _nonce,
    uint256 _deadline,
    string calldata _reason
  ) private view returns (bytes32) {
    bytes32 _structHash = keccak256(
      abi.encode(_REQUEST_AUTHORIZATION_TYPEHASH, _safetyNetId, _amount, _nonce, _deadline, keccak256(bytes(_reason)))
    );

    bytes32 _domainSeparator =
      keccak256(abi.encode(_EIP712_DOMAIN_TYPEHASH, _REQUEST_DOMAIN_NAME_HASH, _REQUEST_DOMAIN_VERSION_HASH, block.chainid, address(this)));

    return keccak256(abi.encodePacked('\x19\x01', _domainSeparator, _structHash));
  }

  /// @dev Builds the EIP-712 digest for an invite
  function _hashInvite(Invite calldata _invite) private view returns (bytes32) {
    bytes32 _structHash = keccak256(abi.encode(_INVITE_TYPEHASH, _invite.safetyNetId, _invite.nonce));

    bytes32 _domainSeparator =
      keccak256(abi.encode(_EIP712_DOMAIN_TYPEHASH, _INVITE_DOMAIN_NAME_HASH, _INVITE_DOMAIN_VERSION_HASH, block.chainid, address(this)));

    return keccak256(abi.encodePacked('\x19\x01', _domainSeparator, _structHash));
  }
}
