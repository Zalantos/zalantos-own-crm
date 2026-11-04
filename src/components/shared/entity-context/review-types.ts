export type ReviewItem = {
  id: string;
  type: string;
  entity: string;
  beforeValue: unknown;
  afterValue: unknown;
  confidence: number;
  explanation: string;
  evidence?: string | null;
  duplicateOfId?: string | null;
  approved: boolean;
  status: string;
};

export type ReviewProposal = {
  id: string;
  status: string;
  confidence: number;
  createdAt: string;
  items: ReviewItem[];
};
