import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import {
  SafetyNetCreated as SafetyNetCreatedEvent,
  SafetyNetStarted as SafetyNetStartedEvent,
  SafetyNetDecommissioned as SafetyNetDecommissionedEvent,
  InviteRedeemed as InviteRedeemedEvent,
  FundsDeposited as FundsDepositedEvent,
  FundsWithdrawn as FundsWithdrawnEvent,
  RequestCreated as RequestCreatedEvent,
  WithdrawalPending as WithdrawalPendingEvent,
  WithdrawalContested as WithdrawalContestedEvent,
  WithdrawalVetoed as WithdrawalVetoedEvent,
  WithdrawalAutoExecuted as WithdrawalAutoExecutedEvent,
  RequestNonceCancelled as RequestNonceCancelledEvent,
} from "../generated/SafetyNet/SafetyNet"
import {
  SafetyNet,
  Member,
  Deposit,
  Withdrawal,
  Request,
  Contest,
  ActivityItem,
} from "../generated/schema"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHex() + "-" + event.logIndex.toString()
}

function memberId(netId: string, addr: Address): string {
  return netId + "-" + addr.toHex()
}

function createActivity(
  event: ethereum.Event,
  netId: string,
  type: string,
  actor: Bytes,
  amount: BigInt | null,
  reason: string | null,
  requestId: string | null
): void {
  let item = new ActivityItem(eventId(event))
  item.safetyNet = netId
  item.type = type
  item.actor = actor
  item.amount = amount
  item.reason = reason
  item.request = requestId
  item.timestamp = event.block.timestamp
  item.blockNumber = event.block.number
  item.transactionHash = event.transaction.hash
  item.save()
}

// Ensure a Member exists; returns it. New members increment memberCount.
function ensureMember(
  net: SafetyNet,
  addr: Address,
  timestamp: BigInt,
  isOwner: boolean,
  viaInvite: boolean
): Member {
  let id = memberId(net.id, addr)
  let member = Member.load(id)
  if (member == null) {
    member = new Member(id)
    member.safetyNet = net.id
    member.address = addr
    member.joinedAt = timestamp
    member.isOwner = isOwner
    member.viaInvite = viaInvite
    member.totalDeposited = BigInt.zero()
    member.totalWithdrawn = BigInt.zero()
    member.save()
    net.memberCount = net.memberCount + 1
    net.save()
  }
  return member
}

// ---------------------------------------------------------------------------
// Net lifecycle
// ---------------------------------------------------------------------------

export function handleSafetyNetCreated(event: SafetyNetCreatedEvent): void {
  let netId = event.params.id.toString()
  let net = new SafetyNet(netId)
  net.owner = event.params.owner
  net.token = event.params.token
  net.minimumMembers = event.params.minimumMembers
  net.maximumMembers = event.params.maximumMembers
  net.contestThreshold = event.params.contestThreshold
  net.initialDeposit = event.params.initialDeposit
  net.fixedDeposit = event.params.fixedDeposit
  net.redeemRatio = event.params.redeemRatio
  net.autoThreshold = event.params.autoThreshold
  net.epochDuration = event.params.epochDuration
  net.smallWithdrawsLimit = event.params.smallWithdrawsLimit
  net.createdAt = event.block.timestamp
  net.startedAt = null
  net.decommissioned = false
  net.decommissionedAt = null
  net.memberCount = 0
  net.totalBalance = BigInt.zero()
  net.totalDeposited = BigInt.zero()
  net.totalWithdrawn = BigInt.zero()
  net.save()

  // Genesis members from the event's members array.
  let members = event.params.members
  let owner = event.params.owner
  for (let i = 0; i < members.length; i++) {
    let addr = members[i]
    ensureMember(net, addr, event.block.timestamp, addr.equals(owner), false)
  }
  // Owner is always a member even if not present in the array.
  ensureMember(net, owner, event.block.timestamp, true, false)

  createActivity(
    event,
    netId,
    "NET_CREATED",
    event.params.owner,
    null,
    null,
    null
  )
}

export function handleSafetyNetStarted(event: SafetyNetStartedEvent): void {
  let netId = event.params.id.toString()
  let net = SafetyNet.load(netId)
  if (net == null) return
  net.startedAt = event.params.startTime
  net.save()

  createActivity(event, netId, "NET_STARTED", net.owner, null, null, null)
}

export function handleSafetyNetDecommissioned(
  event: SafetyNetDecommissionedEvent
): void {
  let netId = event.params.id.toString()
  let net = SafetyNet.load(netId)
  if (net == null) return
  net.decommissioned = true
  net.decommissionedAt = event.block.timestamp
  net.save()

  createActivity(
    event,
    netId,
    "NET_DECOMMISSIONED",
    net.owner,
    null,
    null,
    null
  )
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export function handleInviteRedeemed(event: InviteRedeemedEvent): void {
  let netId = event.params.safetyNetId.toString()
  let net = SafetyNet.load(netId)
  if (net == null) return
  ensureMember(net, event.params.redeemer, event.block.timestamp, false, true)

  createActivity(
    event,
    netId,
    "MEMBER_JOINED",
    event.params.redeemer,
    null,
    null,
    null
  )
}

// ---------------------------------------------------------------------------
// Funds
// ---------------------------------------------------------------------------

export function handleFundsDeposited(event: FundsDepositedEvent): void {
  let netId = event.params.id.toString()
  let net = SafetyNet.load(netId)
  if (net == null) return

  // A deposit can be the joining act; make sure the member exists.
  let member = ensureMember(
    net,
    event.params.member,
    event.block.timestamp,
    event.params.member.equals(Address.fromBytes(net.owner)),
    false
  )

  let deposit = new Deposit(eventId(event))
  deposit.safetyNet = netId
  deposit.member = member.id
  deposit.amount = event.params.amount
  deposit.timestamp = event.block.timestamp
  deposit.blockNumber = event.block.number
  deposit.transactionHash = event.transaction.hash
  deposit.save()

  member.totalDeposited = member.totalDeposited.plus(event.params.amount)
  member.save()

  net.totalDeposited = net.totalDeposited.plus(event.params.amount)
  net.totalBalance = net.totalBalance.plus(event.params.amount)
  net.save()

  createActivity(
    event,
    netId,
    "DEPOSIT",
    event.params.member,
    event.params.amount,
    null,
    null
  )
}

export function handleFundsWithdrawn(event: FundsWithdrawnEvent): void {
  let netId = event.params.id.toString()
  let net = SafetyNet.load(netId)
  if (net == null) return

  let member = ensureMember(
    net,
    event.params.member,
    event.block.timestamp,
    event.params.member.equals(Address.fromBytes(net.owner)),
    false
  )

  let withdrawal = new Withdrawal(eventId(event))
  withdrawal.safetyNet = netId
  withdrawal.member = member.id
  withdrawal.amount = event.params.amount
  withdrawal.timestamp = event.block.timestamp
  withdrawal.blockNumber = event.block.number
  withdrawal.transactionHash = event.transaction.hash
  withdrawal.save()

  member.totalWithdrawn = member.totalWithdrawn.plus(event.params.amount)
  member.save()

  net.totalWithdrawn = net.totalWithdrawn.plus(event.params.amount)
  net.totalBalance = net.totalBalance.minus(event.params.amount)
  net.save()

  createActivity(
    event,
    netId,
    "WITHDRAWAL",
    event.params.member,
    event.params.amount,
    null,
    null
  )
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export function handleRequestCreated(event: RequestCreatedEvent): void {
  let netId = event.params.safetyNetId.toString()
  let requestId = event.params.id.toString()

  let request = new Request(requestId)
  request.safetyNet = netId
  request.owner = event.params.owner
  request.amount = event.params.amount
  request.reason = event.params.reason
  request.createdAt = event.params.timestamp
  request.status = "PENDING"
  request.contestCount = 0
  request.pendingAt = null
  request.resolvedAt = null
  request.save()

  createActivity(
    event,
    netId,
    "REQUEST_CREATED",
    event.params.owner,
    event.params.amount,
    event.params.reason,
    requestId
  )
}

export function handleWithdrawalPending(event: WithdrawalPendingEvent): void {
  let requestId = event.params.requestId.toString()
  let request = Request.load(requestId)
  if (request == null) return
  request.pendingAt = event.block.timestamp
  request.save()

  createActivity(
    event,
    request.safetyNet,
    "REQUEST_PENDING",
    event.params.owner,
    event.params.amount,
    null,
    requestId
  )
}

export function handleWithdrawalContested(
  event: WithdrawalContestedEvent
): void {
  let requestId = event.params.requestId.toString()
  let request = Request.load(requestId)
  if (request == null) return
  request.contestCount = request.contestCount + 1
  request.save()

  let contest = new Contest(eventId(event))
  contest.request = requestId
  contest.safetyNet = request.safetyNet
  contest.contester = event.transaction.from
  contest.timestamp = event.block.timestamp
  contest.transactionHash = event.transaction.hash
  contest.save()

  createActivity(
    event,
    request.safetyNet,
    "REQUEST_CONTESTED",
    event.transaction.from,
    null,
    null,
    requestId
  )
}

export function handleWithdrawalVetoed(event: WithdrawalVetoedEvent): void {
  let requestId = event.params.requestId.toString()
  let request = Request.load(requestId)
  if (request == null) return
  request.status = "VETOED"
  request.resolvedAt = event.block.timestamp
  request.save()

  createActivity(
    event,
    request.safetyNet,
    "REQUEST_VETOED",
    event.params.owner,
    null,
    null,
    requestId
  )
}

export function handleWithdrawalAutoExecuted(
  event: WithdrawalAutoExecutedEvent
): void {
  let requestId = event.params.requestId.toString()
  let request = Request.load(requestId)
  if (request == null) return
  request.status = "EXECUTED"
  request.resolvedAt = event.block.timestamp
  request.save()

  createActivity(
    event,
    request.safetyNet,
    "REQUEST_EXECUTED",
    event.params.owner,
    event.params.amount,
    null,
    requestId
  )
}

export function handleRequestNonceCancelled(
  event: RequestNonceCancelledEvent
): void {
  let netId = event.params.safetyNetId.toString()
  // The nonce is the request identifier here.
  let requestId = event.params.nonce.toString()
  let request = Request.load(requestId)
  if (request != null) {
    request.status = "CANCELLED"
    request.resolvedAt = event.block.timestamp
    request.save()
  }

  createActivity(
    event,
    netId,
    "REQUEST_CANCELLED",
    event.params.owner,
    null,
    null,
    request != null ? requestId : null
  )
}
