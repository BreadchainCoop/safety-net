"use client";

import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useModal } from "./context";
import { Body, Heading3 } from "@breadcoop/ui";
import { Check, X } from "@phosphor-icons/react";

export default function ModalPresenter() {
  const { modalState, setModal } = useModal();

  // Auto-dismiss success modals after 3s
  useEffect(() => {
    if (!modalState) return;
    const isSuccess =
      (modalState.type === "DEPOSIT_RESULT" ||
        modalState.type === "WITHDRAW_RESULT" ||
        modalState.type === "VOTE_RESULT" ||
        modalState.type === "DECOMMISSION_RESULT") &&
      modalState.result === "success";
    if (!isSuccess) return;

    const timer = setTimeout(() => setModal(null), 3000);
    return () => clearTimeout(timer);
  }, [modalState, setModal]);

  if (!modalState) return null;

  const getTitle = () => {
    switch (modalState.type) {
      case "FUND_CREATION_INIT":
        return "Creating Fund";
      case "FUND_CREATION_SUCCESS":
        return "Fund Created";
      case "FUND_CREATION_FAILED":
        return "Creation Failed";
      case "DEPOSIT_INIT":
        return "Confirm Deposit";
      case "DEPOSIT_LOADING":
        return "Depositing...";
      case "DEPOSIT_RESULT":
        return modalState.result === "success" ? "Deposit Successful" : "Deposit Failed";
      case "WITHDRAW_LOADING":
        return "Processing Withdrawal...";
      case "WITHDRAW_RESULT":
        return modalState.result === "success" ? "Withdrawal Complete" : "Withdrawal Failed";
      case "VOTE_LOADING":
        return "Submitting Vote...";
      case "VOTE_RESULT":
        return modalState.result === "success" ? "Vote Submitted" : "Vote Failed";
      case "DECOMMISSION_LOADING":
        return "Decommissioning...";
      case "DECOMMISSION_RESULT":
        return modalState.result === "success" ? "Fund Decommissioned" : "Decommission Failed";
      default:
        return "Transaction";
    }
  };

  const getMessage = () => {
    switch (modalState.type) {
      case "FUND_CREATION_INIT":
        return modalState.status === "awaiting"
          ? "Please confirm the transaction in your wallet."
          : modalState.status === "approved"
            ? "Transaction submitted. Waiting for confirmation..."
            : "Fund created successfully!";
      case "FUND_CREATION_SUCCESS":
        return `Your fund (ID: ${modalState.fundId}) has been created.`;
      case "FUND_CREATION_FAILED":
        return modalState.msg || "Failed to create fund. Please try again.";
      case "DEPOSIT_LOADING":
        if (modalState.step === "approving") return "Approving token spend...";
        if (modalState.step === "depositing") return "Submitting deposit...";
        return "Processing your deposit...";
      case "DEPOSIT_RESULT":
        return modalState.msg || (modalState.result === "success"
          ? "Your deposit was successful."
          : "Deposit failed. Please try again.");
      case "WITHDRAW_LOADING":
        if (modalState.step === "simulating") return "Simulating transaction...";
        if (modalState.step === "submitting") return "Submitting withdrawal...";
        return "Processing your withdrawal...";
      case "WITHDRAW_RESULT":
        return modalState.msg || (modalState.result === "success"
          ? "Your withdrawal was processed."
          : "Withdrawal failed. Please try again.");
      case "VOTE_LOADING":
        return modalState.msg || "Submitting your vote...";
      case "VOTE_RESULT":
        return modalState.msg || (modalState.result === "success"
          ? "Your vote has been recorded."
          : "Vote submission failed.");
      case "DECOMMISSION_LOADING":
        return "Decommissioning the fund...";
      case "DECOMMISSION_RESULT":
        return modalState.msg || (modalState.result === "success"
          ? "Fund has been decommissioned. Balances returned to members."
          : "Decommission failed.");
      default:
        return "";
    }
  };

  const isLoading = modalState.type.includes("LOADING") || modalState.type === "FUND_CREATION_INIT";
  const isSuccess =
    "result" in modalState && modalState.result === "success";
  const isError =
    "result" in modalState && modalState.result === "error";

  // Step indicator for deposit loading
  const getStepIndicator = () => {
    if (modalState.type === "DEPOSIT_LOADING" && modalState.step) {
      const steps = [
        { key: "approving", label: "Approve" },
        { key: "depositing", label: "Deposit" },
      ];
      return (
        <div className="flex items-center gap-2 mb-4">
          {steps.map((step, i) => (
            <div key={step.key} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-paper-1" />}
              <div
                className={`flex items-center gap-1.5 text-sm ${
                  modalState.step === step.key
                    ? "text-primary-orange font-medium"
                    : steps.findIndex((s) => s.key === modalState.step) > i
                      ? "text-green-600"
                      : "text-gray-400"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    modalState.step === step.key
                      ? "bg-primary-orange text-white"
                      : steps.findIndex((s) => s.key === modalState.step) > i
                        ? "bg-green-100 text-green-600"
                        : "bg-paper-1 text-gray-400"
                  }`}
                >
                  {steps.findIndex((s) => s.key === modalState.step) > i ? (
                    <Check size={12} weight="bold" />
                  ) : (
                    i + 1
                  )}
                </div>
                {step.label}
              </div>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Dialog.Root open={!!modalState} onOpenChange={() => setModal(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="DialogOverlay fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="DialogContent fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-paper-0 rounded-xl p-6 w-full max-w-md z-50 shadow-xl">
          <Dialog.Title asChild>
            <Heading3>{getTitle()}</Heading3>
          </Dialog.Title>
          <div className="mt-4">
            {getStepIndicator()}
            <Body>{getMessage()}</Body>
            {isLoading && (
              <div className="mt-4 flex justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary-orange border-t-transparent rounded-full" />
              </div>
            )}
            {isSuccess && (
              <div className="mt-4 flex justify-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <Check size={24} weight="bold" className="text-green-600" />
                </div>
              </div>
            )}
            {isError && (
              <div className="mt-4 flex justify-center">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <X size={24} weight="bold" className="text-red-600" />
                </div>
              </div>
            )}
          </div>
          {!isLoading && (
            <div className="mt-6 flex justify-end">
              <Dialog.Close asChild>
                <button className="px-4 py-2 bg-primary-orange text-white rounded-lg font-medium hover:opacity-90 transition-opacity">
                  Close
                </button>
              </Dialog.Close>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
