/**
 * Session-related types
 */

export type Activity = {
    type: string;
    timestamp: string;
    details: Record<string, unknown>;
};

export type AuthMethod = 'wallet' | 'gmail' | 'both' | null;

export interface UserSession {
    sessionId: string;
    userId: string;
    authMethod: AuthMethod;
    walletAddress: string | null;
    startTime: string;
    isActive: boolean;
    endTime?: string;
}

export interface UserProfile {
    id: string;
    wallet_address: string;
    total_earnings: number;
    total_tasks_completed: number;
    reputation_score: number;
    joined_at: string;
    user_name: string | null;
    referral_code: string | null;
} 