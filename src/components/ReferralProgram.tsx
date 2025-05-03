
import React, { useState } from 'react';
import { Copy, Users, CheckCircle, User } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export const ReferralProgram = () => {
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyReferralLink = () => {
    // Generate a mock referral link
    const referralLink = `https://swarm.network/r/${Math.random().toString(36).substring(2, 10)}`;

    // Copy to clipboard
    navigator.clipboard.writeText(referralLink)
      .then(() => {
        setCopySuccess(true);
        toast.success("Referral link copied to clipboard!");

        // Reset after 3 seconds
        setTimeout(() => setCopySuccess(false), 3000);
      })
      .catch(err => {
        toast.error("Failed to copy referral link");
        console.error('Failed to copy: ', err);
      });
  };

  return (
    // <div className="stat-card">
    //   <div className="flex justify-between items-center mb-4">
    //     <div className="flex items-center gap-2">
    //       <h2 className="text-xl font-semibold">Referral Program</h2>
    //       <InfoTooltip content="Invite friends to join Swarm Network and earn a percentage of their rewards" />
    //     </div>
    //   </div>

    //   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    //     <div className="flex flex-col items-center p-4 bg-slate-800/30 rounded-lg">
    //       <div className="flex items-center gap-2 mb-1">
    //         <User className="w-5 h-5 text-blue-400" />
    //         <span className="text-xl font-bold">0</span>
    //       </div>
    //       <div className="text-sm text-slate-400">Direct Referrals</div>
    //     </div>

    //     <div className="flex flex-col items-center p-4 bg-slate-800/30 rounded-lg">
    //       <div className="flex items-center gap-2 mb-1">
    //         <Users className="w-5 h-5 text-indigo-400" />
    //         <span className="text-xl font-bold">0</span>
    //       </div>
    //       <div className="text-sm text-slate-400">Indirect Referrals</div>
    //     </div>

    //     <div className="flex flex-col items-center p-4 bg-slate-800/30 rounded-lg">
    //       <div className="text-xl font-bold">0.00</div>
    //       <div className="text-sm text-slate-400">Total Rewards</div>
    //     </div>
    //   </div>

    //   <div className="mb-6">
    //     <div className="text-sm text-slate-300 mb-2">Your Referral Link</div>
    //     <div className="flex gap-2">
    //       <div className="flex-1 bg-slate-800 rounded-lg py-2 px-3 text-slate-400 border border-slate-700">
    //         {/* This is just a placeholder */}
    //         https://swarm.network/r/xxxxx
    //       </div>
    //       <Button 
    //         className={`${copySuccess ? 'bg-green-600 hover:bg-green-700' : 'bg-swarm-accent-blue hover:bg-swarm-accent-blue/90'}`}
    //         onClick={handleCopyReferralLink}
    //       >
    //         {copySuccess ? (
    //           <>
    //             <CheckCircle className="w-4 h-4 mr-1" />
    //             <span>Copied</span>
    //           </>
    //         ) : (
    //           <>
    //             <Copy className="w-4 h-4 mr-1" />
    //             <span>Copy</span>
    //           </>
    //         )}
    //       </Button>
    //     </div>
    //     <div className="text-sm text-slate-400 mt-2">
    //       Share this link to earn 5% of your direct referrals' earnings and 2% from their referrals!
    //     </div>
    //   </div>

    //   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    //     <div>
    //       <h3 className="text-sm font-medium text-slate-300 mb-2">Recent Referrals</h3>
    //       <div className="text-sm text-slate-400 italic">
    //         No referrals yet. Share your link to start earning!
    //       </div>
    //     </div>

    //     <div>
    //       <h3 className="text-sm font-medium text-slate-300 mb-2">Recent Rewards</h3>
    //       <div className="text-sm text-slate-400 italic">
    //         No rewards yet. Invite friends to earn passive income!
    //       </div>
    //     </div>
    //   </div>
    // </div>
    <h1></h1>
  );
};
