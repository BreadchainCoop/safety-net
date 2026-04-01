export type FundStatus =
  | "not-started"
  | "active"
  | "payment-due"
  | "decommissionable"
  | "decommissioned";

export function getFundStatus(
  fund: {
    safetyNetStart: bigint;
    owner: string;
  },
  isDecommissionable: boolean,
  nowSeconds: bigint
): FundStatus {
  if (fund.owner === "0x0000000000000000000000000000000000000000") {
    return "decommissioned";
  }
  if (isDecommissionable) {
    return "decommissionable";
  }
  if (fund.safetyNetStart > nowSeconds) {
    return "not-started";
  }
  return "active";
}

export function getStatusColor(status: FundStatus): string {
  switch (status) {
    case "active":
      return "text-green-600 bg-green-50";
    case "not-started":
      return "text-blue-600 bg-blue-50";
    case "payment-due":
      return "text-amber-600 bg-amber-50";
    case "decommissionable":
      return "text-red-600 bg-red-50";
    case "decommissioned":
      return "text-gray-600 bg-gray-50";
  }
}
