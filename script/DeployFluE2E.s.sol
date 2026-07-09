// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProxyAdmin} from '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';
import {Script} from 'forge-std/Script.sol';
import {console} from 'forge-std/console.sol';

import {DKIMRegistry} from '@zk-email/contracts/DKIMRegistry.sol';

import {InviteGenerator} from 'script/InviteGenerator.sol';
import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {ZkEmailFluVerifier} from 'src/contracts/ZkEmailFluVerifier.sol';
import {FluClaimGroth16Verifier} from 'src/contracts/verifiers/FluClaimGroth16Verifier.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

/// @dev Minimal ERC20 for local E2E (mirrors test/mocks/MockERC20).
contract E2EToken {
  string public name = 'E2E Token';
  string public symbol = 'E2E';
  uint8 public decimals = 18;
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;

  function mint(address to, uint256 amount) external {
    balanceOf[to] += amount;
  }

  function approve(address spender, uint256 amount) external returns (bool) {
    allowance[msg.sender][spender] = amount;
    return true;
  }

  function transfer(address to, uint256 amount) external returns (bool) {
    balanceOf[msg.sender] -= amount;
    balanceOf[to] += amount;
    return true;
  }

  function transferFrom(address from, address to, uint256 amount) external returns (bool) {
    allowance[from][msg.sender] -= amount;
    balanceOf[from] -= amount;
    balanceOf[to] += amount;
    return true;
  }
}

/**
 * @title DeployFluE2E
 * @notice Stands up the whole flu-claim stack on a local anvil chain and prepares a Safety Net
 *         ready for a flu claim by the claimant (anvil account 0). Run against `anvil --chain-id 100`
 *         so the Gnosis-pinned web app talks to it. After this script, advance the chain past the
 *         first epoch (`cast rpc evm_increaseTime` + `evm_mine`) so claimFlu's waiting period passes.
 * @dev Uses the well-known anvil keys for account 0 (claimant + net owner + admin) and account 1
 *      (second member, needed for minimumMembers). commitmentDelay is set to 0 so the register→claim
 *      flow can be exercised back-to-back in the UI. The DKIM key hash and email commitment are the
 *      TEST-key values from the committed fixture (never production).
 */
contract DeployFluE2E is Script {
  uint256 internal constant _ACCT0_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
  uint256 internal constant _ACCT1_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;

  // From circuits/fixtures + circuits/scripts/pubkey-hash.mjs (TEST key).
  string internal constant _DOMAIN = 'flu-demo.breadchain.xyz';
  bytes32 internal constant _PUBKEY_HASH = 0x0c73ceaaeb7dd16c985eafeed24b868924713b5992cfeb037cd872412112cd80;
  bytes32 internal constant _EMAIL_COMMITMENT = 0x1f238691b95f2244d0e65d6ce002298687af140e8192781bf477ba94b3e11612;

  function run() public {
    address acct0 = vm.addr(_ACCT0_KEY);
    address acct1 = vm.addr(_ACCT1_KEY);

    // 1. Deploy the SafetyNet stack (proxy owned by acct0) + flu stack.
    vm.startBroadcast(_ACCT0_KEY);

    address impl = address(new SafetyNet());
    ProxyAdmin admin = new ProxyAdmin(acct0);
    SafetyNet sn = SafetyNet(
      address(new TransparentUpgradeableProxy(impl, address(admin), abi.encodeWithSelector(SafetyNet.initialize.selector, acct0)))
    );

    DKIMRegistry dkim = new DKIMRegistry(acct0);
    address groth16 = address(new FluClaimGroth16Verifier());
    ZkEmailFluVerifier verifier = new ZkEmailFluVerifier(acct0, address(sn), address(dkim));

    dkim.setDKIMPublicKeyHash(_DOMAIN, _PUBKEY_HASH);
    verifier.setProvider(_DOMAIN, groth16, true);
    verifier.setCommitmentDelay(0); // no wait for the local demo
    sn.setFluClaimVerifier(address(verifier));

    E2EToken token = new E2EToken();
    sn.setTokenAllowed(address(token), true);
    token.mint(acct0, 1_000_000 ether);
    token.mint(acct1, 1_000_000 ether);
    token.approve(address(sn), type(uint256).max);

    // 2. Create a net owned by the claimant, invite acct1, start, onboard both.
    ISafetyNet.SafetyNet memory cfg = ISafetyNet.SafetyNet({
      id: 0,
      owner: acct0,
      minimumMembers: 2,
      maximumMembers: 5,
      contestThreshold: 33,
      safetyNetStart: 0,
      token: address(token),
      members: new address[](0),
      initialDeposit: 100 ether,
      fixedDeposit: 10 ether,
      redeemRatio: 1,
      autoThreshold: 50 ether,
      contestWindow: 3 days,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });
    uint256 id = sn.create('Flu E2E Net', cfg);

    InviteGenerator ig = new InviteGenerator('SafetyNetInvite', '1', 'safetyNet');
    bytes memory sig = ig.generateInvite(_ACCT0_KEY, id, 1, address(sn));
    vm.stopBroadcast();

    vm.broadcast(_ACCT1_KEY);
    sn.redeemInvite(ISafetyNet.Invite({safetyNetId: id, nonce: 1}), sig);

    vm.broadcast(_ACCT1_KEY);
    token.approve(address(sn), type(uint256).max);

    vm.startBroadcast(_ACCT0_KEY);
    sn.start(id);
    sn.deposit(id, cfg.initialDeposit);
    vm.stopBroadcast();

    vm.broadcast(_ACCT1_KEY);
    sn.deposit(id, cfg.initialDeposit);

    console.log('SAFETYNET_ADDRESS=%s', address(sn));
    console.log('FLU_VERIFIER_ADDRESS=%s', address(verifier));
    console.log('DKIM_REGISTRY=%s', address(dkim));
    console.log('GROTH16_VERIFIER=%s', groth16);
    console.log('TOKEN=%s', address(token));
    console.log('NET_ID=%s', id);
    console.log('CLAIMANT=%s', acct0);
    console.log('EPOCH_DURATION_SECONDS=%s', cfg.epochDuration);
  }
}
