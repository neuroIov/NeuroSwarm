import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// POST - Process referral rewards
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {  earning_amount } = body;

    const userIdToProcess = session?.user?.id;

    if (!userIdToProcess) {
      return NextResponse.json(
        { error: 'Earning user ID is required' },
        { status: 400 }
      );
    }

    if (earning_amount === undefined || earning_amount <= 0) {
      return NextResponse.json(
        { error: 'Valid earning amount (greater than 0) is required' },
        { status: 400 }
      );
    }

    console.log('Processing rewards for user:', userIdToProcess, 'amount:', earning_amount);

    // Call the RPC function - make sure function name matches exactly
    const { data, error } = await supabase.rpc('process_referral_rewardsx', {
      p_earning_user_id: userIdToProcess,
      p_earning_amount: earning_amount
    });

    console.log("Processed data response:", data);
    console.log("Error (if any):", error);

    if (error) {
      console.error('Error processing referral rewards:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to process referral rewards' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        success: true,
        message: 'Referral rewards processed successfully',
        data: data || null
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache',
        },
      }
    );
    
  } catch (error) {
    console.error('Process rewards API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}