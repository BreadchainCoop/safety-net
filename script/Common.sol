// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';
import {Script} from 'forge-std/Script.sol';

import {SafetyNet} from '../src/contracts/SafetyNet.sol';

/**
 * @title Common Contract
 * @author Bread Cooperative
 * @notice This contract is used to deploy an upgradeable SafetyNet contract
 * @dev This contract is intended for use in Scripts and Integration Tests
 */
contract Common is Script {
  function setUp() public virtual {}

  function _deploySafetyNet() internal returns (SafetyNet) {
    return new SafetyNet();
  }

  function _deployTransparentProxy(
    address _implementation,
    address _initialOwner,
    bytes memory _initData
  ) internal returns (TransparentUpgradeableProxy) {
    return new TransparentUpgradeableProxy(_implementation, _initialOwner, _initData);
  }

  /**
   * @dev In OZ v5, the TransparentUpgradeableProxy constructor deploys its own internal ProxyAdmin
   *      owned by `initialOwner`. Passing a pre-deployed ProxyAdmin here (as this function previously
   *      did) nests two ProxyAdmins: the proxy's internal admin ends up owned by a redundant
   *      ProxyAdmin that cannot relay upgrade calls, making the proxy permanently non-upgradeable.
   *      `_admin` must therefore be passed directly as the proxy's initial owner.
   */
  function _deployContracts(address _admin) internal returns (TransparentUpgradeableProxy) {
    return _deployTransparentProxy(address(_deploySafetyNet()), _admin, abi.encodeWithSelector(SafetyNet.initialize.selector, _admin));
  }
}
