import { AppApiError } from "./response.mjs";

export function handleStaffGet({ pathname }) {
  if (pathname.startsWith("/api/app/v1/staff")) {
    throw new AppApiError("NOT_IMPLEMENTED", "员工端 App API 会在下一轮接入。", 501);
  }
  return null;
}

export function handleStaffPost({ pathname }) {
  if (pathname.startsWith("/api/app/v1/staff")) {
    throw new AppApiError("NOT_IMPLEMENTED", "员工端 App API 会在下一轮接入。", 501);
  }
  return null;
}
