"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getBoardSnapshot,
  getServerBoardSnapshot,
  subscribeBoard,
} from "@/lib/board-store";
import { startHcpMorningSync } from "@/lib/hcp-client";
import { WallBoard } from "@/components/shop/wall-board";

export default function Wall() {
  const board = useSyncExternalStore(
    subscribeBoard,
    getBoardSnapshot,
    getServerBoardSnapshot,
  );

  useEffect(() => startHcpMorningSync(), []);

  return <WallBoard jobs={board.jobs} />;
}
