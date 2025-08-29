import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // ---- Step 1: Fetch referral rewards via RPC ----
    const {
      data: unclaimedRewards,
      error: rewardsError,
    } = await supabase.rpc('get_referral_rewards', {
      p_referrer_id: userId,
    });

    if (rewardsError) {
      console.error('Error fetching referral rewards via RPC:', rewardsError);
      return NextResponse.json(
        { error: 'Failed to fetch referral rewards' },
        { status: 500 }
      );
    }
    console.log('Referral rewards:', unclaimedRewards);

    // Filter only rewards with amount > 0
    const availableRewards = (unclaimedRewards || []).filter(
      (reward: any) => Number(reward.reward_amount) > 0
    );

    // ---- Step 2: Fetch referral earnings ----
    const {
      data: referralEarnings,
      error: earningsError,
    } = await supabase
      .from('earnings')
      .select('amount')
      .eq('user_id', userId)
      .eq('earning_type', 'referral');

    if (earningsError) {
      console.error('Error fetching referral earnings:', earningsError);
      return NextResponse.json(
        { error: 'Failed to fetch referral earnings' },
        { status: 500 }
      );
    }
    console.log('Referral earnings:', referralEarnings);

    // ---- Step 3: Fetch referrals count ----
    const {
      data: referralsCount,
      error: countError,
    } = await supabase
      .from('referrals')
      .select('id, tier_level', { count: 'exact' })
      .eq('referrer_id', userId);

    if (countError) {
      console.error('Error fetching referrals count:', countError);
      return NextResponse.json(
        { error: 'Failed to fetch referrals count' },
        { status: 500 }
      );
    }
    console.log('Referrals count:', referralsCount);

    // ---- Step 4: Compute totals ----
    const pendingRewards = availableRewards.reduce(
      (sum: number, reward: any) => sum + Number(reward.reward_amount),
      0
    );

    const totalClaimedRewards = (referralEarnings || []).reduce(
      (sum, earning) => sum + Number(earning.amount),
      0
    );

    const totalReferralEarnings = pendingRewards + totalClaimedRewards;

    const tierCounts = (referralsCount || []).reduce(
      (acc: Record<string, number>, referral: any) => {
        acc[referral.tier_level] =
          (acc[referral.tier_level] || 0) + 1;
        return acc;
      },
      {}
    );

    return NextResponse.json(
      {
        unclaimedRewards: availableRewards,
        totalReferrals: referralsCount?.length || 0,
        tierCounts,
        pendingRewards,
        claimedRewards: totalClaimedRewards,
        totalReferralEarnings,
      },
      {
        headers: {
          'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('Referral rewards GET API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Handle claiming referral rewards (backward compatibility)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { reward_id } = body;

    if (!reward_id) {
      return NextResponse.json(
        { error: 'Reward ID is required' },
        { status: 400 }
      );
    }

    // Redirect to the dedicated claim endpoint
    const claimResponse = await fetch(`${request.nextUrl.origin}/api/referrals/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': request.headers.get('Authorization') || '',
        'Cookie': request.headers.get('Cookie') || ''
      },
      body: JSON.stringify({ reward_id })
    });

    const result = await claimResponse.json();
    
    return NextResponse.json(result, { status: claimResponse.status });

  } catch (error) {
    console.error('Referral rewards POST API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}