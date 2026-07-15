export type Client = {
  id: string;
  name: string;
  sector: string;
  initials: string;
  color: string;
  contentCount: number;
  avgScore: number;
  scoreTrend: number;
  activePlans: number;
  lastActive: string;
  recentActivity: string;
  logo?: string;
  owner?: string;
  createdAt?: string;
};
