// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from 'forge-std/Script.sol';
import {console} from 'forge-std/console.sol';

import {DKIMRegistry} from '@zk-email/contracts/DKIMRegistry.sol';

import {DeployFluE2E, E2EToken} from 'script/DeployFluE2E.s.sol';
import {InviteGenerator} from 'script/InviteGenerator.sol';
import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {ZkEmailFluVerifier} from 'src/contracts/ZkEmailFluVerifier.sol';
import {FluClaimGroth16Verifier} from 'src/contracts/verifiers/FluClaimGroth16Verifier.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

/// @dev Local-fork demo: wires the flu stack onto an EXISTING SafetyNet proxy (e.g. the CI/CD
///      deployment) and creates a claim-ready net. Run against an anvil fork of Gnosis after
///      transferring the proxy owner to anvil account 0 (via impersonation). PROXY env = the proxy.
contract DeployFluOnProxy is Script {
  uint256 internal constant _ACCT0_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
  uint256 internal constant _ACCT1_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
  string internal constant _DOMAIN = 'flu-demo.breadchain.xyz';
  string internal constant _BINDING_DOMAIN = 'gmail-demo.breadchain.xyz';
  bytes32 internal constant _PUBKEY_HASH = 0x0c73ceaaeb7dd16c985eafeed24b868924713b5992cfeb037cd872412112cd80;
  bytes32 internal constant _BINDING_PUBKEY_HASH = 0x1caac1cb8551f8a7a14c82dc609d5389fb1e315059ba253cb132fdc346219be8;

  function run() public {
    address acct0 = vm.addr(_ACCT0_KEY);
    address acct1 = vm.addr(_ACCT1_KEY);
    SafetyNet sn = SafetyNet(vm.envAddress('PROXY'));

    vm.startBroadcast(_ACCT0_KEY);

    // Flu stack (acct0 owns the verifier + DKIM registry it operates).
    DKIMRegistry dkim = new DKIMRegistry(acct0);
    address groth16 = address(new FluClaimGroth16Verifier());
    ZkEmailFluVerifier verifier = new ZkEmailFluVerifier(acct0, address(sn), groth16, address(dkim));
    dkim.setDKIMPublicKeyHash(_DOMAIN, _PUBKEY_HASH);
    dkim.setDKIMPublicKeyHash(_BINDING_DOMAIN, _BINDING_PUBKEY_HASH);
    verifier.setProvider(_DOMAIN, true);
    verifier.setBindingProvider(_BINDING_DOMAIN, true);

    // Owner-only proxy wiring (acct0 was made proxy owner via impersonation before this script).
    sn.setFluClaimVerifier(address(verifier));
    E2EToken token = new E2EToken();
    sn.setTokenAllowed(address(token), true);
    token.mint(acct0, 1_000_000 ether);
    token.mint(acct1, 1_000_000 ether);
    token.approve(address(sn), type(uint256).max);

    // A claim-ready net owned by the claimant (acct0).
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
    uint256 id = sn.create('Flu Demo (CI proxy)', cfg);
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

    console.log('PROXY=%s', address(sn));
    console.log('FLU_VERIFIER_ADDRESS=%s', address(verifier));
    console.log('TOKEN=%s', address(token));
    console.log('NET_ID=%s', id);
  }
}
