// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DKIMRegistry} from '@zk-email/contracts/DKIMRegistry.sol';
import {Script} from 'forge-std/Script.sol';
import {console} from 'forge-std/console.sol';

import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {ZkEmailFluVerifier} from 'src/contracts/ZkEmailFluVerifier.sol';
import {FluClaimGroth16Verifier} from 'src/contracts/verifiers/FluClaimGroth16Verifier.sol';

/**
 * @title DeployZkEmailFlu
 * @notice Deploys the ZK Email flu-claim stack next to an existing SafetyNet proxy: the FluClaimV2
 *         Groth16 verifier, a DKIM key-hash registry (unless one is provided), and the
 *         {ZkEmailFluVerifier} extension.
 * @dev Env:
 *      - PRIVATE_KEY       deployer key (optional; falls back to the script sender)
 *      - ADMIN_ADDRESS     owner of the verifier and (fresh) DKIM registry (optional; defaults to deployer)
 *      - SAFETY_NET_PROXY  the SafetyNet proxy the verifier settles claims for (required)
 *      - DKIM_REGISTRY     reuse an existing DKIM registry (optional; deploys a fresh one when unset)
 *
 *      Post-deploy admin actions (see docs/zk-email-flu-claims.md for the full runbook):
 *      1. DKIMRegistry.setDKIMPublicKeyHash(domain, poseidonLarge(rsaModulus, 9, 242)) for each
 *         validated healthcare-provider AND consumer email-provider (gmail/outlook/…) selector,
 *         keys sourced from https://archive.prove.email
 *      2. ZkEmailFluVerifier.setProvider(providerDomain, true) per validated healthcare sender, and
 *         ZkEmailFluVerifier.setBindingProvider(emailProviderDomain, true) per consumer provider
 *      3. SafetyNet.setFluClaimVerifier(verifier) on the proxy (owner-only)
 */
contract DeployZkEmailFlu is Script {
  function run() public {
    uint256 _privateKey = vm.envOr('PRIVATE_KEY', uint256(0));
    address _deployer = _privateKey == 0 ? msg.sender : vm.addr(_privateKey);
    address _admin = vm.envOr('ADMIN_ADDRESS', _deployer);
    address _safetyNet = vm.envAddress('SAFETY_NET_PROXY');
    address _dkimRegistry = vm.envOr('DKIM_REGISTRY', address(0));

    if (_privateKey == 0) {
      vm.startBroadcast();
    } else {
      vm.startBroadcast(_privateKey);
    }

    if (_dkimRegistry == address(0)) {
      _dkimRegistry = address(new DKIMRegistry(_admin));
    }

    address _groth16 = address(new FluClaimGroth16Verifier());
    ZkEmailFluVerifier _verifier = new ZkEmailFluVerifier(_admin, _safetyNet, _groth16, _dkimRegistry);

    // Wire the proxy directly when the deployer owns it; otherwise it stays a documented
    // post-deploy admin action
    if (SafetyNet(_safetyNet).owner() == _deployer) {
      SafetyNet(_safetyNet).setFluClaimVerifier(address(_verifier));
    } else {
      console.log('Deployer is not the SafetyNet owner: call setFluClaimVerifier as the owner post-deploy');
    }

    vm.stopBroadcast();

    console.log('FluClaimGroth16Verifier:', _groth16);
    console.log('DKIMRegistry:', _dkimRegistry);
    console.log('ZkEmailFluVerifier:', address(_verifier));
  }
}
