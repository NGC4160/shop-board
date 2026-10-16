export const STORAGE_KEY = "ngc-shop-board-v6";
export const LEGACY_JOBS_KEY = "ngc-shop-board-v5";
export const LEGACY_SORT_KEY = "ngc-shop-board-sort-v2";

/** Live NGC Housecall Pro Jobs pipeline (Pipeline → Jobs), left to right. */
export const PIPELINE_STATUSES = [
  "New Job",
  "Customer drop off",
  "Pictures Needed",
  "Deposit Needed",
  "RYAN",
  "Need to Order Materials",
  "Waiting on Materials",
  "Unscheduled",
  "Scheduled",
  "Return Call Needed",
  "In Progress",
  "Awaiting Queue",
  "Shop Queue",
  "JESSE- estimate ready to call",
  "Awaiting Estimate",
  "Awaiting Approval",
  "Awaiting Deposit",
  "Awaiting QC",
  "Completed",
  "Awaiting Payment",
  "Awaiting Return Delivery",
  "Customer pick up",
  "Need to Invoice",
  "Invoice Sent",
  "On Hold",
  "Invoice Paid",
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** Live NGC Housecall Pro Field Techs (Settings → Team & Permissions). */
export const PRIMARY_TECHS = [
  "Marlon Gray",
  "Ryan Gorgoglione",
  "Hayden Silva",
] as const;

export type PrimaryTech = (typeof PRIMARY_TECHS)[number];

export const NEXT_ACTION_PRESETS = [
  "Call customer",
  "Text Housecall Pro invoice",
  "Confirm drop-off time",
  "Take pictures",
  "Order parts",
  "Call when parts come in",
  "Test drive",
  "QC and wash",
  "Call customer — cart is ready",
  "Schedule return delivery",
] as const;


export const CART_MAKES = [
  "EZ-GO",
  "Club Car",
  "Yamaha",
  "Icon",
  "Evolution",
  "Advanced EV",
] as const;

export const CART_COLORS = [
  "White",
  "Black",
  "Red",
  "Blue",
  "Green",
  "Tan",
  "Beige",
  "Silver",
  "Platinum",
  "Burgundy",
  "Gray",
  "Orange",
] as const;

export const BAYS = [
  "Bay 1",
  "Bay 2",
  "Bay 3",
  "Bay 4",
  "Bay 5",
  "Bay 6",
  "Outside",
  "Lot",
  "Wash",
  "Trailer",
] as const;

export const PRIORITIES = ["none", "hot", "promised", "waiting"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  none: "No flag",
  hot: "Hot",
  promised: "Promised",
  waiting: "Waiting",
};

export function nextPriority(priority: Priority): Priority {
  const index = PRIORITIES.indexOf(priority);
  return PRIORITIES[(index + 1) % PRIORITIES.length] ?? "none";
}
