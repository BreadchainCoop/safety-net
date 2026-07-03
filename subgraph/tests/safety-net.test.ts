import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  newMockEvent,
} from "matchstick-as/assembly/index"
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
  SafetyNetCreated,
  SafetyNetStarted,
  SafetyNetDecommissioned,
  InviteRedeemed,
  FundsDeposited,
  FundsWithdrawn,
  RequestCreated,
  WithdrawalContested,
  WithdrawalVetoed,
  WithdrawalAutoExecuted,
} from "../generated/SafetyNet/SafetyNet"
import {
  handleSafetyNetCreated,
  handleSafetyNetStarted,
  handleSafetyNetDecommissioned,
  handleInviteRedeemed,
  handleFundsDeposited,
  handleFundsWithdrawn,
  handleRequestCreated,
  handleWithdrawalContested,
  handleWithdrawalVetoed,
  handleWithdrawalAutoExecuted,
} from "../src/mapping"

const OWNER = "0x0000000000000000000000000000000000000001"
const MEMBER2 = "0x0000000000000000000000000000000000000002"
const TOKEN = "0x0000000000000000000000000000000000000099"

function bi(v: i32): BigInt {
  return BigInt.fromI32(v)
}

// Distinct logIndex per mock event so that txHash-logIndex ids (Deposit,
// Withdrawal, Contest, ActivityItem) do not collide within a test.
let LOG_INDEX: i32 = 0
function nextLog(e: ethereum.Event): void {
  e.logIndex = bi(LOG_INDEX++)
}

function createSafetyNetCreatedEvent(id: i32): SafetyNetCreated {
  let e = changetype<SafetyNetCreated>(newMockEvent())
  e.parameters = new Array()
  e.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(bi(id)))
  )
  e.parameters.push(
    new ethereum.EventParam(
      "owner",
      ethereum.Value.fromAddress(Address.fromString(OWNER))
    )
  )
  e.parameters.push(
    new ethereum.EventParam("minimumMembers", ethereum.Value.fromUnsignedBigInt(bi(2)))
  )
  e.parameters.push(
    new ethereum.EventParam("maximumMembers", ethereum.Value.fromUnsignedBigInt(bi(10)))
  )
  e.parameters.push(
    new ethereum.EventParam("contestThreshold", ethereum.Value.fromUnsignedBigInt(bi(2)))
  )
  e.parameters.push(
    new ethereum.EventParam(
      "members",
      ethereum.Value.fromAddressArray([Address.fromString(OWNER)])
    )
  )
  e.parameters.push(
    new ethereum.EventParam(
      "token",
      ethereum.Value.fromAddress(Address.fromString(TOKEN))
    )
  )
  e.parameters.push(
    new ethereum.EventParam("initialDeposit", ethereum.Value.fromUnsignedBigInt(bi(100)))
  )
  e.parameters.push(
    new ethereum.EventParam("fixedDeposit", ethereum.Value.fromUnsignedBigInt(bi(50)))
  )
  e.parameters.push(
    new ethereum.EventParam("redeemRatio", ethereum.Value.fromUnsignedBigInt(bi(1)))
  )
  e.parameters.push(
    new ethereum.EventParam("autoThreshold", ethereum.Value.fromUnsignedBigInt(bi(3)))
  )
  e.parameters.push(
    new ethereum.EventParam("epochDuration", ethereum.Value.fromUnsignedBigInt(bi(604800)))
  )
  e.parameters.push(
    new ethereum.EventParam("smallWithdrawsLimit", ethereum.Value.fromUnsignedBigInt(bi(10)))
  )
  nextLog(e)
  return e
}

function createSafetyNetStartedEvent(id: i32, startTime: i32): SafetyNetStarted {
  let e = changetype<SafetyNetStarted>(newMockEvent())
  e.parameters = new Array()
  e.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(bi(id)))
  )
  e.parameters.push(
    new ethereum.EventParam("startTime", ethereum.Value.fromUnsignedBigInt(bi(startTime)))
  )
  nextLog(e)
  return e
}

function createDecommissionedEvent(id: i32): SafetyNetDecommissioned {
  let e = changetype<SafetyNetDecommissioned>(newMockEvent())
  e.parameters = new Array()
  e.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(bi(id)))
  )
  nextLog(e)
  return e
}

function createInviteRedeemedEvent(netId: i32, redeemer: string): InviteRedeemed {
  let e = changetype<InviteRedeemed>(newMockEvent())
  e.parameters = new Array()
  e.parameters.push(
    new ethereum.EventParam("safetyNetId", ethereum.Value.fromUnsignedBigInt(bi(netId)))
  )
  e.parameters.push(
    new ethereum.EventParam(
      "redeemer",
      ethereum.Value.fromAddress(Address.fromString(redeemer))
    )
  )
  nextLog(e)
  return e
}

function createDepositEvent(netId: i32, member: string, amount: i32): FundsDeposited {
  let e = changetype<FundsDeposited>(newMockEvent())
  e.parameters = new Array()
  e.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(bi(netId)))
  )
  e.parameters.push(
    new ethereum.EventParam(
      "member",
      ethereum.Value.fromAddress(Address.fromString(member))
    )
  )
  e.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(bi(amount)))
  )
  nextLog(e)
  return e
}

function createWithdrawnEvent(netId: i32, member: string, amount: i32): FundsWithdrawn {
  let e = changetype<FundsWithdrawn>(newMockEvent())
  e.parameters = new Array()
  e.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(bi(netId)))
  )
  e.parameters.push(
    new ethereum.EventParam(
      "member",
      ethereum.Value.fromAddress(Address.fromString(member))
    )
  )
  e.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(bi(amount)))
  )
  nextLog(e)
  return e
}

function createRequestCreatedEvent(
  reqId: i32,
  netId: i32,
  owner: string,
  amount: i32,
  reason: string
): RequestCreated {
  let e = changetype<RequestCreated>(newMockEvent())
  e.parameters = new Array()
  e.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(bi(reqId)))
  )
  e.parameters.push(
    new ethereum.EventParam("safetyNetId", ethereum.Value.fromUnsignedBigInt(bi(netId)))
  )
  e.parameters.push(
    new ethereum.EventParam(
      "owner",
      ethereum.Value.fromAddress(Address.fromString(owner))
    )
  )
  e.parameters.push(
    new ethereum.EventParam("timestamp", ethereum.Value.fromUnsignedBigInt(bi(1000)))
  )
  e.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(bi(amount)))
  )
  e.parameters.push(
    new ethereum.EventParam("reason", ethereum.Value.fromString(reason))
  )
  nextLog(e)
  return e
}

function createContestedEvent(reqId: i32, owner: string): WithdrawalContested {
  let e = changetype<WithdrawalContested>(newMockEvent())
  e.parameters = new Array()
  e.parameters.push(
    new ethereum.EventParam("requestId", ethereum.Value.fromUnsignedBigInt(bi(reqId)))
  )
  e.parameters.push(
    new ethereum.EventParam(
      "owner",
      ethereum.Value.fromAddress(Address.fromString(owner))
    )
  )
  e.parameters.push(
    new ethereum.EventParam("timestamp", ethereum.Value.fromUnsignedBigInt(bi(1100)))
  )
  nextLog(e)
  return e
}

function createVetoedEvent(reqId: i32, owner: string): WithdrawalVetoed {
  let e = changetype<WithdrawalVetoed>(newMockEvent())
  e.parameters = new Array()
  e.parameters.push(
    new ethereum.EventParam("requestId", ethereum.Value.fromUnsignedBigInt(bi(reqId)))
  )
  e.parameters.push(
    new ethereum.EventParam(
      "owner",
      ethereum.Value.fromAddress(Address.fromString(owner))
    )
  )
  e.parameters.push(
    new ethereum.EventParam("timestamp", ethereum.Value.fromUnsignedBigInt(bi(1200)))
  )
  nextLog(e)
  return e
}

function createAutoExecutedEvent(reqId: i32, owner: string, amount: i32): WithdrawalAutoExecuted {
  let e = changetype<WithdrawalAutoExecuted>(newMockEvent())
  e.parameters = new Array()
  e.parameters.push(
    new ethereum.EventParam("requestId", ethereum.Value.fromUnsignedBigInt(bi(reqId)))
  )
  e.parameters.push(
    new ethereum.EventParam(
      "owner",
      ethereum.Value.fromAddress(Address.fromString(owner))
    )
  )
  e.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(bi(amount)))
  )
  nextLog(e)
  return e
}

describe("SafetyNet subgraph", () => {
  afterEach(() => {
    clearStore()
    LOG_INDEX = 0
  })

  test("created then started lifecycle", () => {
    handleSafetyNetCreated(createSafetyNetCreatedEvent(1))
    assert.entityCount("SafetyNet", 1)
    assert.fieldEquals("SafetyNet", "1", "decommissioned", "false")
    assert.fieldEquals("SafetyNet", "1", "memberCount", "1")
    assert.fieldEquals("SafetyNet", "1", "owner", OWNER)
    assert.fieldEquals("SafetyNet", "1", "startedAt", "null")
    // NET_CREATED activity emitted
    assert.entityCount("ActivityItem", 1)

    handleSafetyNetStarted(createSafetyNetStartedEvent(1, 12345))
    assert.fieldEquals("SafetyNet", "1", "startedAt", "12345")
    assert.entityCount("ActivityItem", 2)

    handleSafetyNetDecommissioned(createDecommissionedEvent(1))
    assert.fieldEquals("SafetyNet", "1", "decommissioned", "true")
    assert.entityCount("ActivityItem", 3)
  })

  test("invite redeemed increments memberCount and emits activity", () => {
    handleSafetyNetCreated(createSafetyNetCreatedEvent(1))
    handleInviteRedeemed(createInviteRedeemedEvent(1, MEMBER2))
    assert.fieldEquals("SafetyNet", "1", "memberCount", "2")
    assert.entityCount("Member", 2)
    assert.fieldEquals("Member", "1-" + MEMBER2, "viaInvite", "true")
    assert.fieldEquals("Member", "1-" + MEMBER2, "isOwner", "false")
  })

  test("deposit aggregates and activity", () => {
    handleSafetyNetCreated(createSafetyNetCreatedEvent(1))
    handleFundsDeposited(createDepositEvent(1, OWNER, 100))
    handleFundsDeposited(createDepositEvent(1, MEMBER2, 40))

    assert.fieldEquals("SafetyNet", "1", "totalDeposited", "140")
    assert.fieldEquals("SafetyNet", "1", "totalBalance", "140")
    assert.fieldEquals("Member", "1-" + OWNER, "totalDeposited", "100")
    // MEMBER2 auto-created via deposit
    assert.fieldEquals("SafetyNet", "1", "memberCount", "2")
    assert.entityCount("Deposit", 2)

    handleFundsWithdrawn(createWithdrawnEvent(1, OWNER, 30))
    assert.fieldEquals("SafetyNet", "1", "totalWithdrawn", "30")
    assert.fieldEquals("SafetyNet", "1", "totalBalance", "110")
    assert.fieldEquals("Member", "1-" + OWNER, "totalWithdrawn", "30")
    assert.entityCount("Withdrawal", 1)
  })

  test("request created then contested then vetoed", () => {
    handleSafetyNetCreated(createSafetyNetCreatedEvent(1))
    handleRequestCreated(createRequestCreatedEvent(7, 1, OWNER, 25, "rent"))
    assert.fieldEquals("Request", "7", "status", "PENDING")
    assert.fieldEquals("Request", "7", "reason", "rent")
    assert.fieldEquals("Request", "7", "safetyNet", "1")
    assert.fieldEquals("Request", "7", "contestCount", "0")

    handleWithdrawalContested(createContestedEvent(7, OWNER))
    assert.fieldEquals("Request", "7", "contestCount", "1")
    assert.entityCount("Contest", 1)

    handleWithdrawalVetoed(createVetoedEvent(7, OWNER))
    assert.fieldEquals("Request", "7", "status", "VETOED")
  })

  test("request created then executed", () => {
    handleSafetyNetCreated(createSafetyNetCreatedEvent(1))
    handleRequestCreated(createRequestCreatedEvent(8, 1, OWNER, 60, "medical"))
    handleWithdrawalAutoExecuted(createAutoExecutedEvent(8, OWNER, 60))
    assert.fieldEquals("Request", "8", "status", "EXECUTED")
    assert.fieldEquals("Request", "8", "resolvedAt", "1")
  })

  test("activity item emitted per event type", () => {
    handleSafetyNetCreated(createSafetyNetCreatedEvent(1)) // NET_CREATED
    handleFundsDeposited(createDepositEvent(1, OWNER, 100)) // DEPOSIT
    handleRequestCreated(createRequestCreatedEvent(9, 1, OWNER, 10, "x")) // REQUEST_CREATED
    handleWithdrawalContested(createContestedEvent(9, OWNER)) // REQUEST_CONTESTED
    handleWithdrawalVetoed(createVetoedEvent(9, OWNER)) // REQUEST_VETOED
    assert.entityCount("ActivityItem", 5)
  })
})
