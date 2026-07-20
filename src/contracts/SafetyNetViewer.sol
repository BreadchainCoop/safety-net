// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISafetyNetViewer} from '../interfaces/ISafetyNetViewer.sol';
import {ISafetyNet} from '../interfaces/ISafetyNet.sol';
import {SafetyNet} from '../contracts/SafetyNet.sol';

contract SafetyNetViewer is ISafetyNetViewer {
  SafetyNet public immutable safetyNet;

  constructor(address _safetyNet) {
    safetyNet = SafetyNet(_safetyNet);
  }

  function getMemberEpochStatus(uint256 _id, address _member) external view override returns (MemberEpochStatus memory status) {
    uint256 epoch = safetyNet.getCurrentEpochIndex(_id);
    status.currentEpoch = epoch;
    status.hasDeposited = safetyNet.hasMemberDepositedInEpoch(_id, _member, epoch);
    status.duesRemaining = safetyNet.duesRemainingThisEpoch(_id, _member);
    status.smallWithdrawsUsed = safetyNet.smallWithdrawsCount(_id, epoch, _member);
    status.withdrawableBalance = safetyNet.memberWithdrawableBalance(_id, _member);
  }

  function getPoolLiquidity(uint256 _id) external view override returns (PoolLiquidity memory pool) {
    ISafetyNet.SafetyNet memory sn = safetyNet.getSafetyNet(_id);
    pool.totalBalance = safetyNet.safetyNetBalance(_id);
    pool.memberCount = sn.members.length;
    uint256 epoch = safetyNet.getCurrentEpochIndex(_id);
    uint256 active = 0;
    for (uint256 i = 0; i < sn.members.length; i++) {
      if (safetyNet.hasMemberDepositedInEpoch(_id, sn.members[i], epoch)) {
        active++;
      }
    }
    pool.activeMemberCount = active;
  }

  function getMemberDashboard(uint256 _id, address _member) external view override returns (MemberDashboard memory dashboard) {
    // Epoch status
    uint256 epoch = safetyNet.getCurrentEpochIndex(_id);
    dashboard.epochStatus.currentEpoch = epoch;
    dashboard.epochStatus.hasDeposited = safetyNet.hasMemberDepositedInEpoch(_id, _member, epoch);
    dashboard.epochStatus.duesRemaining = safetyNet.duesRemainingThisEpoch(_id, _member);
    dashboard.epochStatus.smallWithdrawsUsed = safetyNet.smallWithdrawsCount(_id, epoch, _member);
    dashboard.epochStatus.withdrawableBalance = safetyNet.memberWithdrawableBalance(_id, _member);

    // Pool liquidity
    ISafetyNet.SafetyNet memory sn = safetyNet.getSafetyNet(_id);
    dashboard.poolLiquidity.totalBalance = safetyNet.safetyNetBalance(_id);
    dashboard.poolLiquidity.memberCount = sn.members.length;
    uint256 active = 0;
    for (uint256 i = 0; i < sn.members.length; i++) {
      if (safetyNet.hasMemberDepositedInEpoch(_id, sn.members[i], epoch)) {
        active++;
      }
    }
    dashboard.poolLiquidity.activeMemberCount = active;

    // Member's safety nets
    dashboard.memberSafetyNetIds = safetyNet.getMemberSafetyNets(_member);
  }
}
