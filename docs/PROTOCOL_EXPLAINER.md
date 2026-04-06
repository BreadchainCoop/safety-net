# Safety Net Protocol Explainer

A plain-language overview of how Safety Net works — what it is, how groups use it, and
what the key mechanics mean in practice.

---

## What is Safety Net?

Safety Net is an on-chain implementation of a Broodfond — a Dutch model of mutual-aid
income protection popular among freelancers and the self-employed. A Broodfond is a group
savings pool where members regularly contribute money, and any member who experiences an
income disruption (illness, job loss, unexpected expense) can request a payout from the
shared pool.

Safety Net brings this model to EVM-compatible blockchains using ERC-20 tokens. Any group
of people — a freelancers' collective, a community cooperative, a friend group — can create
a Safety Net, invite members, and run the mutual-aid protocol entirely on-chain with no
central custodian.

Key properties:

- Non-custodial. Funds sit in the smart contract, not with any individual or company.
- Permissioned membership. The Safety Net owner controls who can join via signed invites.
- Configurable rules. Each Safety Net has its own parameters for deposits, withdrawals,
  voting thresholds, and time windows.
- Transparent. All contributions, balances, votes, and withdrawals are publicly visible.

---

## Lifecycle: Create → Join → Deposit → Withdraw → Decommission

### 1. Create

The Safety Net owner calls `create()` with a configuration struct. This sets:

- The ERC-20 token used for all deposits and withdrawals (must be whitelisted by the
  contract administrator).
- The initial deposit required when a member first joins.
- The fixed deposit (dues) each member must contribute per epoch.
- The redeem ratio, which amplifies each member's withdrawable balance relative to
  what they deposited.
- Time parameters: epoch duration, contest window, voting window, Safety Net start time.
- Membership limits: minimum and maximum member count.
- Governance thresholds: consensus threshold, auto-execution threshold, and small
  withdrawals limit.

A unique ID is assigned and the Safety Net is live once the `safetyNetStart` timestamp
is reached.

### 2. Join

New members join by redeeming a signed invite from the Safety Net owner. The owner
generates an EIP-712 signed message containing the Safety Net ID and a unique nonce.
This signature is passed to `redeemInvite()`. The contract:

- Verifies the signature was created by the Safety Net owner.
- Ensures the nonce has not been used before (preventing replay attacks).
- Checks the Safety Net has not reached its maximum member count.
- Adds the caller as a member.

This approach lets the owner control access off-chain (no gas cost to the owner) while
the join transaction is paid by the new member.

### 3. Deposit

Members deposit by calling `deposit()` or `depositFor()` (which allows depositing on
behalf of another member).

On a member's first deposit (onboarding epoch), they must pay exactly the `initialDeposit`
amount in a single transaction. This acts as a commitment fee and sets up their monthly
contribution record.

In subsequent epochs, members pay the `fixedDeposit` amount. Partial payments are allowed
— a member can spread their epoch dues across multiple transactions — as long as the total
paid in one epoch does not exceed the `fixedDeposit`. Each deposit increases the member's
`withdrawableBalance` by `depositAmount * redeemRatio`.

### 4. Withdraw

There are two withdrawal paths depending on the amount:

**Small withdrawals** (amount <= autoThreshold):
The withdrawal executes immediately without any voting. There is a per-epoch limit on how
many small withdrawals a member can make (`smallWithdrawsLimit`). Once that limit is
reached, any further withdrawal — even a small one — is blocked until the next epoch.

**Large withdrawals** (amount > autoThreshold):
A withdrawal request is created and enters the contest/vote flow described below.

The amount a member can withdraw is calculated from their contribution history and the
redeem ratio. The daily withdrawable amount is:

    dailyAmount = (memberFixedDeposit * redeemRatio) / 30

A member specifies how many days of benefit they want when calling `withdraw()`.

### 5. Decommission

A Safety Net can be decommissioned if any member missed their full epoch dues in any
past epoch. The `isDecommissionable()` function checks all past epochs for any member
whose total deposits fell below `fixedDeposit`.

When decommissioned, the contract distributes each member's `withdrawableBalance` back
to them, then splits any remaining pool balance equally among all members. The Safety Net
record is deleted.

---

## Epoch System and Dues

Time is divided into fixed-length epochs, measured in seconds (e.g., 30 days = 2592000
seconds). The epoch index is computed from the Safety Net start time:

    epochIndex = (currentTimestamp - safetyNetStart) / epochDuration

Epoch 0 is the first epoch. Each member must deposit exactly `fixedDeposit` tokens within
each epoch to remain in good standing. Partial deposits are accumulated and tracked per
epoch per member in `epochMemberDepositedAmount`.

If any member fails to meet their dues by the end of an epoch, the Safety Net becomes
decommissionable. This creates a strong social and financial incentive for all members
to contribute on time.

---

## Small vs Large Withdrawals

The `autoThreshold` parameter divides withdrawals into two categories:

**Small withdrawal** — amount is at or below `autoThreshold`:
- Executes immediately with no approval required.
- Deducts from the member's `withdrawableBalance` and the pool's total balance.
- Tracked by epoch to enforce the `smallWithdrawsLimit` per member per epoch.

**Large withdrawal** — amount exceeds `autoThreshold`:
- A `Request` is created with the requested amount and timestamp.
- Enters a contest window. Any member can call `contest()` during this window to flag
  the request for peer review.
- If nobody contests it within the contest window, any address can call
  `executeContestedWithdrawal()` after the contest window closes to auto-execute the payout.
- If the request is contested, it moves to the voting phase.

---

## Contest and Voting Mechanism

When a large withdrawal request is contested, the group votes on whether to approve it.

**Contesting**: Any member can call `contest()` within `contestWindow` seconds of the
request being created. Once contested, the request can only be resolved by a vote.

**Voting**: Members call `vote()` with `true` (approve) or `false` (reject). Each member
gets one vote. Voting is open for `votingWindow` seconds from the request timestamp.

**Consensus check**: After each vote, the contract checks whether the yes-vote count
exceeds the consensus threshold:

    yesVotes > (memberCount * consensusThreshold) / 100

If consensus is reached, the withdrawal executes immediately. The member receives their
requested amount from the pool.

**No consensus / vote expires**: If the voting window closes without consensus being
reached, the request is neither auto-executed nor manually executable. Funds remain in
the pool. (Members would need to create a new request if they still wish to withdraw.)

---

## RedeemRatio Explained

The `redeemRatio` is the core economic lever of a Broodfond. When a member deposits
tokens, their withdrawable balance grows by more than what they put in:

    withdrawableBalance += depositAmount * redeemRatio

For example, with redeemRatio = 3:
- A member deposits 10 tokens.
- Their withdrawable balance increases by 30 tokens.
- The pool only received 10 real tokens, but the member can potentially withdraw 30.

This is not magic — it works because the pool is collective. Many members contribute
regularly, so the total tokens in the pool are much larger than any individual's deposits.
In a healthy Safety Net, only a minority of members need payouts at any one time, so the
pool can support payouts larger than individual deposits.

The contract enforces:
- MINIMUM_REDEEM_RATIO = 1 (no amplification; withdrawable = deposited)
- MAXIMUM_REDEEM_RATIO = 22 (22x amplification)

The redeem ratio is set at creation time and cannot be changed. This ensures members
know the payout terms before joining and no party can retroactively change the deal.

---

## Governance Parameters and Configurability

Each Safety Net has governance parameters that control how the group operates. Starting
with this release (#41), the Safety Net owner (the address that called `create()`) can
update five of these parameters after creation using dedicated setter functions.

This is distinct from the contract-level owner (who manages the token whitelist). The
Safety Net owner is a per-group role.

### Configurable Parameters

#### consensusThreshold (setConsensusThreshold)
The percentage of members whose yes-votes are required to immediately approve a contested
withdrawal.

- Valid range: 1 to 100 (inclusive).
- Example: 60 means more than 60% of members must vote yes.
- Emits: ParameterUpdated(id, keccak256("consensusThreshold"), newValue)

#### autoThreshold (setAutoThreshold)
The maximum withdrawal amount that executes automatically without any voting or contest.
Withdrawals above this threshold become requests and enter the contest/vote flow.

- Valid range: > 0
- Emits: ParameterUpdated(id, keccak256("autoThreshold"), newValue)

#### smallWithdrawsLimit (setSmallWithdrawsLimit)
The maximum number of small (auto-executed) withdrawals a member may make per epoch.
Once this limit is reached, the member must wait for the next epoch before making
another small withdrawal.

- Valid range: > 0
- Emits: ParameterUpdated(id, keccak256("smallWithdrawsLimit"), newValue)

#### contestWindow (setContestWindow)
The duration in seconds during which a member can contest a large withdrawal request.
After this window closes without a contest, the request can be auto-executed.

- Valid range: > 0 AND <= votingWindow
- The constraint ensures the contest window never exceeds the voting window (a request
  must have time to be voted on after it can be contested).
- Emits: ParameterUpdated(id, keccak256("contestWindow"), newValue)

#### votingWindow (setVotingWindow)
The duration in seconds during which members may cast votes on a contested request.
The timer starts when the request is created (not when it is contested).

- Valid range: > 0 AND >= contestWindow
- The constraint ensures there is always time to vote on a contested request.
- Emits: ParameterUpdated(id, keccak256("votingWindow"), newValue)

### Access Control

All setter functions check that `msg.sender == safetyNets[id].owner`. Any other caller
receives the `Unauthorized` error. This is intentional — governance of each Safety Net
belongs to the group's creator, not the platform operator.

### Parameter Interdependencies

The contest window and voting window are co-constrained:

    contestWindow <= votingWindow

This means:
- You cannot set the contest window to be longer than the voting window.
- You cannot set the voting window to be shorter than the contest window.
- When reducing the voting window, you may first need to reduce the contest window.
- When increasing the contest window, you may first need to increase the voting window.

Owners should be transparent with their group when changing parameters, since these
settings directly affect members' ability to contest and vote on withdrawal requests.

---

## Summary of Key Roles

| Role | Description |
|------|-------------|
| Contract owner | Deployed by the platform; manages the ERC-20 token whitelist. Set via `initialize()`. |
| Safety Net owner | Group creator; configures and governs one Safety Net. Set per Safety Net in the `create()` call. |
| Member | Deposits dues, makes withdrawals, contests requests, votes. Joins via signed invite. |

---

## Summary of Key Events

| Event | Trigger |
|-------|---------|
| SafetyNetCreated | New Safety Net created |
| InviteRedeemed | Member joins via invite |
| FundsDeposited | Member deposits tokens |
| FundsWithdrawn | Small withdrawal auto-executed |
| RequestCreated | Large withdrawal request opened |
| WithdrawalPending | Large withdrawal request opened (alias) |
| WithdrawalContested | Request flagged for voting |
| Voted | Member casts a vote |
| WithdrawalApproved | Consensus reached; withdrawal executed |
| WithdrawalAutoExecuted | Contest window closed with no contest; auto-executed |
| RequestEnded | Voting concluded |
| SafetyNetDecommissioned | Safety Net wound down |
| ParameterUpdated | Owner changed a governance parameter |
| TokenAllowed | Platform owner whitelisted or de-listed a token |

---

## Quick Reference: Validation Rules

| Parameter | Rule |
|-----------|------|
| minimumMembers | >= 2 |
| maximumMembers | >= minimumMembers |
| initialDeposit | > 0 |
| fixedDeposit | > 0 |
| epochDuration | > 0 |
| redeemRatio | 1 to 22 (inclusive) |
| autoThreshold | > 0 |
| smallWithdrawsLimit | > 0 |
| consensusThreshold | 1 to 100 (settable post-create) |
| contestWindow | > 0 and <= votingWindow (settable post-create) |
| votingWindow | > 0 and >= contestWindow (settable post-create) |
