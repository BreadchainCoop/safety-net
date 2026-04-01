"use client";

import { Body } from "@breadcoop/ui";
import { cn } from "@/utils/format";

const TABS = [
  { id: "all", label: "All" },
  { id: "due", label: "Payment Due" },
  { id: "claimable", label: "Claimable" },
  { id: "past", label: "Past" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

interface DashboardTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  counts: Record<TabId, number>;
}

export function DashboardTabs({ activeTab, onTabChange, counts }: DashboardTabsProps) {
  return (
    <div className="flex gap-1 border-b border-paper-1 mb-6">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "px-4 py-2 -mb-px transition-colors",
            activeTab === tab.id
              ? "border-b-2 border-primary-orange"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Body className={activeTab === tab.id ? "font-medium" : ""}>
            {tab.label}
            {counts[tab.id] > 0 && (
              <span className="ml-1.5 text-xs bg-paper-1 px-1.5 py-0.5 rounded-full">
                {counts[tab.id]}
              </span>
            )}
          </Body>
        </button>
      ))}
    </div>
  );
}
