/**
 * Session-related types
 */

export type Activity = {
    type: string;
    timestamp: string;
    details: Record<string, unknown>;
};

export type AuthMethod = 'wallet' | 'email' | 'oauth' | 'both' | null;

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
    email: string;
    total_earnings: number;
    total_tasks_completed: number;
    reputation_score: number;
    joined_at: string;
    user_name: string | null;
    referral_code: string | null;
    subscription_tier?: string;
    // New subscription-related fields
    credits?: number;
    max_devices?: number;
    swarm_hours_remaining?: number;
}