"use client";

import { type ReactNode, createContext, useContext, useState } from "react";
import { Address } from "viem";

export type TModalStatus = "loading" | "success" | "error";

export type FundCreationInitModalState = {
  type: "FUND_CREATION_INIT";
  status: "awaiting" | "approved" | "successful";
};

export type FundCreationSuccessModalState = {
  type: "FUND_CREATION_SUCCESS";
  fundId: string;
};

export type FundCreationFailedModalState = {
  type: "FUND_CREATION_FAILED";
  msg?: string;
};

export type DepositInitModalState = {
  type: "DEPOSIT_INIT";
  amount: bigint;
  tokenAddress: Address;
  fundId: bigint;
};

export type DepositLoadingModalState = {
  type: "DEPOSIT_LOADING";
  step?: "approving" | "depositing";
};

export type DepositResultModalState = {
  type: "DEPOSIT_RESULT";
  result: "success" | "error";
  msg?: string;
  amount?: number;
};

export type WithdrawLoadingModalState = {
  type: "WITHDRAW_LOADING";
  step?: "simulating" | "submitting";
};

export type WithdrawResultModalState = {
  type: "WITHDRAW_RESULT";
  result: "success" | "error";
  msg?: string;
  amount?: number;
};

export type VoteLoadingModalState = {
  type: "VOTE_LOADING";
  msg?: string;
};

export type VoteResultModalState = {
  type: "VOTE_RESULT";
  result: "success" | "error";
  msg?: string;
};

export type DecommissionLoadingModalState = {
  type: "DECOMMISSION_LOADING";
};

export type DecommissionResultModalState = {
  type: "DECOMMISSION_RESULT";
  result: "success" | "error";
  msg?: string;
};

export type ModalState =
  | FundCreationInitModalState
  | FundCreationSuccessModalState
  | FundCreationFailedModalState
  | DepositInitModalState
  | DepositLoadingModalState
  | DepositResultModalState
  | WithdrawLoadingModalState
  | WithdrawResultModalState
  | VoteLoadingModalState
  | VoteResultModalState
  | DecommissionLoadingModalState
  | DecommissionResultModalState
  | null;

export type ModalContext = {
  modalState: ModalState;
  setModal: (modalState: ModalState) => void;
};

const ModalContext = createContext<ModalContext>({
  modalState: null,
  setModal() {},
});

function ModalProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<ModalState>(null);

  function setModal(modalState: ModalState) {
    setModalState(modalState);
  }

  return (
    <ModalContext.Provider value={{ modalState, setModal }}>
      {children}
    </ModalContext.Provider>
  );
}

const useModal = () => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};

export { ModalProvider, useModal };
