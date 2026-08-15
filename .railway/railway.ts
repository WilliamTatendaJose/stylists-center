import { defineRailway, github, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("web", {
    source: github("WilliamTatendaJose/stylists-center"),
    build: "pnpm run build",
  });

  return project("stylists-center", {
    resources: [web],
  });
});
