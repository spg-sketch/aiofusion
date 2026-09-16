import { useEffect, useState } from "react";

export type ArchiveItem = {
  id: string;
  title: string;
  contentType: string;
  spokesperson?: string;
  status: "Draft" | "Final";
  tags: string[];
  body: string;
  createdAt: string;
  releasedAt?: string;
  projectId?: string;
  targetPhrases?: Array<{
    id: string;
    text: string;
    intentGroup: "discovery" | "shortlist" | "comparison";
  }>;
  targetPhraseIds?: string[];
};

export type PlannerProject = {
  id: string;
  title: string;
  contentType: string;
  spokesperson: string;
  keyMessage: string;
  audience: string;
  channels: string[];
  week: number;
  status: "Planned" | "Drafting" | "Review" | "Approved";
  releaseDate: string;
  notes: string;
  projectId?: string;
};

const archive: ArchiveItem[] = [
  {
    id: "content-northstar-1",
    title: "Northstar Health launches practical prevention guide",
    contentType: "Article (Trade Publication)",
    spokesperson: "Dr Maya Patel",
    status: "Final",
    tags: ["preventative care", "workplace wellbeing"],
    body: "Northstar Health shares practical guidance for preventative care at work.",
    createdAt: "2025-02-10T10:00:00.000Z",
    releasedAt: "2025-02-12T10:00:00.000Z",
    projectId: "northstar-demo",
  },
];

const planner: PlannerProject[] = [
  {
    id: "plan-northstar-1",
    title: "Preventative care at work: an evidence-led guide",
    contentType: "Whitepaper",
    spokesperson: "Dr Maya Patel",
    keyMessage: "Evidence made practical",
    audience: "People and wellbeing teams",
    channels: ["Priority", "Owned"],
    week: 11,
    status: "Approved",
    releaseDate: "2025-03-14",
    notes: "Build on the recent trade coverage.",
    projectId: "northstar-demo",
  },
];

export function effectiveProjectId(clientId?: string): string {
  return clientId && clientId !== "default" ? clientId : "northstar-demo";
}

export function loadArchive(clientId?: string): ArchiveItem[] {
  const projectId = effectiveProjectId(clientId);
  return archive.filter((item) => item.projectId === projectId);
}

export function loadPlannerProjects(clientId?: string): PlannerProject[] {
  const projectId = effectiveProjectId(clientId);
  return planner.filter((item) => item.projectId === projectId);
}

export function scoreProject(project: PlannerProject): {
  visibility: number;
  authority: number;
} {
  const channelMultiplier = Math.min(1.5, 0.5 + project.channels.length * 0.25);
  const statusMultiplier =
    project.status === "Approved"
      ? 1
      : project.status === "Review"
        ? 0.85
        : project.status === "Drafting"
          ? 0.7
          : 0.5;
  return {
    visibility: Math.round(45 * channelMultiplier * statusMultiplier),
    authority: Math.round(42 * statusMultiplier),
  };
}

export function useContentStore(): number {
  const [version, setVersion] = useState(1);
  useEffect(() => {
    const handler = () => setVersion((current) => current + 1);
    window.addEventListener("aio:content-store-changed", handler);
    return () => window.removeEventListener("aio:content-store-changed", handler);
  }, []);
  return version;
}