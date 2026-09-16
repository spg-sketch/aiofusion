const projects = [
  { id: "project-northstar", name: "Northstar launch narrative", owner: "alex.morgan", color: "#1A647B", initials: "NL" },
  { id: "project-cascade", name: "Cascade product visibility", owner: "brightline-pr", color: "#C8497A", initials: "CP" },
];
export function loadStoredProjects(): any[] { return projects.map((project) => ({ ...project })); }
