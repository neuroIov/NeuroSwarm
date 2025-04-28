import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SupabaseService, ReferralStats } from '../services/SupabaseService';
import { useWallet } from '@solana/wallet-adapter-react';
import { config } from '../config';

const defaultStats: ReferralStats = {
    referral_code: "",
    referral_link: "",
    direct_referrals: 0,
    indirect_referrals: 0,
    total_rewards: 0,
    recent_referrals: [],
    recent_rewards: []
};

export function ReferralPanel() {
    const [stats, setStats] = useState<ReferralStats>(defaultStats);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { wallet } = useWallet();
    
    // Initialize Supabase service
    const supabaseService = new SupabaseService(config.SUPABASE_URL, config.SUPABASE_KEY);

    // Fetch referral stats when wallet changes
    useEffect(() => {
        if (!wallet?.adapter.publicKey) return;
        
        const fetchReferralStats = async () => {
            setLoading(true);
            setError(null);
            
            try {
                // Get user ID from wallet public key
                const userId = wallet.adapter.publicKey?.toString() || crypto.randomUUID();
                
                // Fetch real referral stats from Supabase
                const referralStats = await supabaseService.getReferralStats(userId);
                setStats(referralStats);
            } catch (err) {
                console.error("Failed to fetch referral stats:", err);
                setError("Failed to load referral statistics. Please try again later.");
            } finally {
                setLoading(false);
            }
        };
        
        fetchReferralStats();
        
        // Set up polling to refresh stats every 30 seconds
        const intervalId = setInterval(fetchReferralStats, 30000);
        
        return () => clearInterval(intervalId);
    }, [wallet?.adapter.publicKey]);

    const copyReferralLink = () => {
        navigator.clipboard.writeText(stats.referral_link)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(err => {
                console.error("Failed to copy link:", err);
                setError("Failed to copy link to clipboard.");
            });
    };

    // Format date/time
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    // Format source string to be more readable
    const formatSource = (source: string) => {
        if (source.startsWith("task_")) {
            return `Task ${source.replace("task_", "")}`;
        }
        return source;
    };

    return (
        <motion.div 
            className="border rounded-lg p-6 shadow-lg bg-gradient-to-br from-gray-900 to-gray-800 text-white"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <h2 className="text-2xl font-bold mb-4">Referral Program</h2>
            
            {loading ? (
                <div className="flex justify-center items-center h-32">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
                </div>
            ) : error ? (
                <div className="text-red-500 p-4 bg-red-100 bg-opacity-10 rounded">{error}</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-gray-800 bg-opacity-50 p-4 rounded-lg">
                            <h3 className="text-lg font-semibold mb-1">Direct Referrals</h3>
                            <p className="text-3xl font-bold">{stats.direct_referrals}</p>
                        </div>
                        <div className="bg-gray-800 bg-opacity-50 p-4 rounded-lg">
                            <h3 className="text-lg font-semibold mb-1">Indirect Referrals</h3>
                            <p className="text-3xl font-bold">{stats.indirect_referrals}</p>
                        </div>
                        <div className="bg-gray-800 bg-opacity-50 p-4 rounded-lg">
                            <h3 className="text-lg font-semibold mb-1">Total Rewards</h3>
                            <p className="text-3xl font-bold">{stats.total_rewards.toFixed(2)}</p>
                        </div>
                    </div>
                    
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-2">Your Referral Link</h3>
                        <div className="flex items-center">
                            <input 
                                type="text" 
                                readOnly 
                                value={stats.referral_link} 
                                className="flex-grow p-2 bg-gray-700 rounded-l focus:outline-none text-white"
                            />
                            <button 
                                onClick={copyReferralLink}
                                className="py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-r focus:outline-none transition-colors"
                            >
                                {copied ? "Copied!" : "Copy"}
                            </button>
                        </div>
                        <p className="text-sm mt-2 text-gray-400">
                            Share this link to earn 5% of your direct referrals' earnings and 2% from their referrals!
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 className="text-lg font-semibold mb-3">Recent Referrals</h3>
                            {stats.recent_referrals.length > 0 ? (
                                <div className="overflow-y-auto max-h-60">
                                    {stats.recent_referrals.map((referral, index) => (
                                        <div key={index} className="mb-2 p-3 bg-gray-800 bg-opacity-50 rounded">
                                            <div className="flex justify-between">
                                                <div className="font-medium">{referral.referred_id}</div>
                                                <div className="text-sm text-gray-400">
                                                    {referral.tier === 1 ? 'Direct' : 'Indirect'}
                                                </div>
                                            </div>
                                            <div className="text-sm text-gray-400 mt-1">
                                                {formatDate(referral.created_at)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-400 italic">No referrals yet. Share your link to start earning!</p>
                            )}
                        </div>
                        
                        <div>
                            <h3 className="text-lg font-semibold mb-3">Recent Rewards</h3>
                            {stats.recent_rewards.length > 0 ? (
                                <div className="overflow-y-auto max-h-60">
                                    {stats.recent_rewards.map((reward, index) => (
                                        <div key={index} className="mb-2 p-3 bg-gray-800 bg-opacity-50 rounded">
                                            <div className="flex justify-between">
                                                <div className="font-medium">
                                                    {reward.amount.toFixed(2)} NSWM
                                                </div>
                                                <div className="text-sm text-gray-400">
                                                    {reward.tier === 1 ? 'Direct (5%)' : 'Indirect (2%)'}
                                                </div>
                                            </div>
                                            <div className="text-sm mt-1 flex justify-between">
                                                <span>{formatSource(reward.source)}</span>
                                                <span className="text-gray-400">{formatDate(reward.timestamp)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-400 italic">No rewards yet. Invite friends to earn passive income!</p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </motion.div>
    );
}