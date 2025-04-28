import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { SupabaseService } from '../services/SupabaseService';
import { config } from '../config';

interface ReferralProcessorProps {
  referralCode: string | null;
  onProcessed: () => void;
}

/**
 * Component that processes referrals when a user connects their wallet
 * This is a "headless" component that doesn't render anything visible
 */
export function ReferralProcessor({ referralCode, onProcessed }: ReferralProcessorProps) {
  const { wallet } = useWallet();
  
  useEffect(() => {
    // Only process if we have both a wallet and a referral code
    if (!wallet?.adapter.publicKey || !referralCode) return;
    
    const processReferral = async () => {
      try {
        // Get the user's ID from their wallet
        const userId = wallet.adapter.publicKey?.toString() || '';
        if (!userId) {
          console.error('No wallet public key available');
          onProcessed();
          return;
        }
        
        // Skip if this is the same as the referrer (can't refer yourself)
        if (referralCode.includes(userId.substring(0, 4))) {
          console.log('Cannot refer yourself');
          onProcessed();
          return;
        }
        
        // Initialize Supabase service
        const supabaseService = new SupabaseService(config.SUPABASE_URL, config.SUPABASE_KEY);
        
        // Look up the referrer by their code
        const referrerData = await supabaseService.findReferrerByCode(referralCode);
        
        if (!referrerData) {
          console.error('Error finding referrer');
          onProcessed();
          return;
        }
        
        const referrerId = referrerData.user_id;
        
        // Record the referral (tier 1 = direct referral)
        await supabaseService.recordReferral(referrerId, userId, 1);
        
        // Also record any indirect referrals (tier 2)
        // Get the referrer's referrer (if any)
        const indirectReferrer = await supabaseService.findReferrerForUser(referrerId);
        
        if (indirectReferrer?.referrer_id) {
          // Record tier 2 referral
          await supabaseService.recordReferral(indirectReferrer.referrer_id, userId, 2);
        }
        
        // Clear the referral code from storage to prevent duplicate processing
        localStorage.removeItem('referralCode');
        
        console.log('Referral processed successfully');
      } catch (err) {
        console.error('Error processing referral:', err);
      } finally {
        onProcessed();
      }
    };
    
    processReferral();
  }, [wallet?.adapter.publicKey, referralCode, onProcessed]);
  
  // This is a headless component - it doesn't render anything
  return null;
}
