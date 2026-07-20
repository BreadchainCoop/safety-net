// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISafetyNet} from './ISafetyNet.sol';

interface ISafetyNetViewer {
  struct MemberEpochStatus {
    bool hasDeposited;
    uint256 duesRemaining;
    uint256 smallWithdrawsUsed;
    uint256 withdrawableBalance;
    uint256 currentEpoch;
  }

  struct PoolLiquidity {
    uint256 totalBalance;
    uint256 memberCount;
    uint256 activeMemberCount;
  }

  struct MemberDashboard {
    MemberEpochStatus epochStatus;
    PoolLiquidity poolLiquidity;
    uint256[] memberSafetyNetIds;
  }

  function getMemberEpochStatus(uint256 safetyNetId, address member) external view returns (MemberEpochStatus memory);
  function getPoolLiquidity(uint256 safetyNetId) external view returns (PoolLiquidity memory);
  function getMemberDashboard(uint256 safetyNetId, address member) external view returns (MemberDashboard memory);
}
