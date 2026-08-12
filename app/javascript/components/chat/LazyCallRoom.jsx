import { lazy } from "react";

const loadCallRoom = () => import("./CallRoom");

export const preloadCallRoom = () => loadCallRoom();
export default lazy(loadCallRoom);
