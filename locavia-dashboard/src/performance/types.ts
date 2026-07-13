export interface PerformancePeriod {
  start: string;
  end: string;
}

export interface TeamPerformanceSnapshot {
  teamId: string;
  period: PerformancePeriod;
  delivery: {
    throughput: number;
    leadTimeAvg: number | null;
    leadTimeP85: number | null;
    cycleTimeP85: number | null;
  };
  flow: {
    wip: number;
    inflow: number;
    outflow: number;
    flowBalance: number;
    agingItems: number;
  };
  predictability: {
    committed: number;
    delivered: number;
    rate: number | null;
  };
  quality: {
    staleItems: number;
    dataCoverage: number;
    storyPointsCoverage: number;
  };
  maturity?: {
    level: number;
    score: number;
    dimensions: Record<string, number>;
  };
}
