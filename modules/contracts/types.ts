export interface ContractsChannelIds {
  rolesContract: string;
  rulesContracts: string;
  adminReview: string;
  approvalTickets: string;
  logs: string;
}

export interface ContractsRoleIds {
  contractsPending: string;
  contracts: string;
}

export interface ContractsConfig {
  channelIds: ContractsChannelIds;
  roleIds: ContractsRoleIds;
  maxSkillLevel: number;
  minSumForAutoApprove: number;
  ocrConfidenceThreshold: number;
}

export type SkillsParseResult =
  | {
      success: true;
      sum: number;
      confidence: number;
      levels: number[];
    }
  | {
      success: false;
      reason: 'no_image' | 'ocr_failed' | 'low_confidence' | 'no_numbers';
      confidence?: number;
    };
