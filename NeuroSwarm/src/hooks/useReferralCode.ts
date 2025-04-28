import { useEffect, useState } from 'react';

/**
 * Hook to extract and store referral codes from URL parameters
 * @returns The current referral code if any
 */
export function useReferralCode(): string | null {
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    // Check for stored referral code first
    const storedCode = localStorage.getItem('referralCode');
    
    if (storedCode) {
      setReferralCode(storedCode);
      return;
    }

    // Extract referral code from URL if present
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const refCode = urlParams.get('ref');
      
      if (refCode) {
        // Store the referral code
        localStorage.setItem('referralCode', refCode);
        setReferralCode(refCode);
        
        // Remove the ref parameter from URL to keep it clean
        // This creates a cleaner URL without the referral parameter
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('ref');
        window.history.replaceState({}, document.title, newUrl.toString());
      }
    } catch (error) {
      console.error('Error processing referral code:', error);
    }
  }, []);

  return referralCode;
}
