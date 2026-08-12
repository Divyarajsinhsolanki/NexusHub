export const workspaceAutoResourcesForPath = (pathname = "") => {
  if (pathname === "/my-work") return ["activity"];
  return [];
};
