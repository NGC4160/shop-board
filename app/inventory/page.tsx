import type { Metadata } from "next";
import { InventoryApp } from "@/components/inventory/inventory-app";

export const metadata: Metadata = {
  title: "Neighborhood Golf Carts — Inventory",
  description:
    "On-hand inventory for Neighborhood Golf Carts. Quantities and values share the parts board document.",
};

export default function InventoryPage() {
  return <InventoryApp />;
}
