import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    console.log('Starting claim reward process...');
    const supabase = await createClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      console.error('Authentication error:', sessionError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    console.log('Authenticated user:', session.user.id);
    const body = await request.json();
    const { reward_id } = body;

    if (!reward_id) {
      console.error('No reward_id provided in request body');
      return NextResponse.json(
        { error: 'Reward ID is required' },
        { status: 400 }
      );
    }

    console.log('Fetching reward details for reward_id:', reward_id);

    // Get the reward details using RPC to ensure it belongs to the user
    const {
      data: unclaimedRewards,
      error: rewardsError,
    } = await supabase.rpc('get_referral_rewards', {
      p_referrer_id: session.user.id,
    });

    if (rewardsError) {
      console.error('Error fetching referral rewards via RPC:', rewardsError);
      return NextResponse.json(
        { error: 'Failed to fetch referral rewards' },
        { status: 500 }
      );
    }

    console.log('RPC returned rewards:', unclaimedRewards);

    // Find the specific reward to claim
    const rewardToClaim = (unclaimedRewards || []).find(
      (reward: any) => reward.reward_id === reward_id && Number(reward.reward_amount) > 0
    );

    if (!rewardToClaim) {
      console.error('Reward not found or has zero amount. Reward ID:', reward_id);
      return NextResponse.json(
        { error: 'Reward not found or already claimed' },
        { status: 404 }
      );
    }

    console.log('Found reward to claim:', rewardToClaim);
    const rewardAmount = Number(rewardToClaim.reward_amount);

    // Claim the reward using RPC
    console.log('Attempting to claim reward via RPC...');
    const { data: claimResult, error: claimError } = await supabase
      .rpc('claim_referral_reward', {
        p_reward_id: reward_id
      });

    if (claimError || !claimResult?.success) {
      console.error('Error claiming reward via RPC:', claimError || claimResult?.error);
      return NextResponse.json(
        { error: claimError?.message || claimResult?.error || 'Failed to claim reward' },
        { status: 500 }
      );
    }

    console.log('Claim RPC result:', claimResult);

    console.log('Calling add_earnings edge function...');

    // Add earnings to user's account using the existing earnings API
    const earningsResponse = await fetch(
      'https://phpaoasgtqsnwohtevwf.supabase.co/functions/v1/add_earnings',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reward_type: 'referral',
          amount: rewardAmount,
          user_id: session.user.id,
        }),
      }
    );

    if (!earningsResponse.ok) {
      const errorText = await earningsResponse.text();
      console.error('Error adding earnings:', errorText);
      
      console.log('Rolling back reward claim due to earnings error...');
      
      // Since we can't directly roll back the RPC, we'll log this serious error
      console.error('CRITICAL: Earnings addition failed after successful claim. Manual intervention may be needed.');
      console.error('Reward ID:', reward_id);
      console.error('User ID:', session.user.id);
      console.error('Amount:', rewardAmount);

      return NextResponse.json(
        { error: 'Failed to add earnings' },
        { status: 500 }
      );
    }

    const earningsResult = await earningsResponse.json();
    console.log('Earnings addition result:', earningsResult);

    console.log('Claim process completed successfully');
    return NextResponse.json({
      success: true,
      message: `Successfully claimed ${rewardAmount} SP from ${rewardToClaim.referred_name}`,
      data: {
        claimed_amount: rewardAmount,
        referred_name: rewardToClaim.referred_name,
        ...claimResult.data
      }
    });

  } catch (error) {
    console.error('Claim referral reward API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}