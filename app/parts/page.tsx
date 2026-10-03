import type { Metadata } from "next";
import { PartsApp } from "@/components/parts/parts-app";

export const metadata: Metadata = {
  title: "Neighborhood Golf Carts — Parts Board",
  description:
    "Incoming parts and shipments for Neighborhood Golf Carts. Shared shop-floor list of who a part is for, vendor, status, and tracking.",
};

export default function PartsPage() {
  return <PartsApp />;
}
