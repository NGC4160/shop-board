"use client";

import { useSyncExternalStore } from "react";
import {
  getBoardSnapshot,
  getServerBoardSnapshot,
  subscribeBoard,
} from "@/lib/board-store";
import { WallBoard } from "@/components/shop/wall-board";

export default function Wall() {
  const board = useSyncExternalStore(
    subscribeBoard,
    getBoardSnapshot,
    getServerBoardSnapshot,
  );
  return <WallBoard jobs={board.jobs} />;
}
