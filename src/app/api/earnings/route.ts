import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// GET - Load user earnings
export async function GET(request: NextRequest) {
  try {
    console.log('Starting /api/earnings GET request');
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('User authentication error:', userError);
      return NextResponse.json(
        { totalEarnings: 0 },
        { headers: { 'Cache-Control': 'private, no-cache' } }
      );
    }

    console.log('User authenticated:', user.id);

    // Get latest total earnings from earnings_history
    const { data, error } = await supabase
      .from('earnings_history')
      .select('total_amount')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error loading earnings:', error);

      // If no record exists yet, return 0
      if (error.code === 'PGRST116') {
        console.log('No earnings record found, returning 0');
        return NextResponse.json(
          { totalEarnings: 0 },
          { headers: { 'Cache-Control': 'private, no-cache' } }
        );
      }

      return NextResponse.json(
        { totalEarnings: 0 },
        { headers: { 'Cache-Control': 'private, no-cache' } }
      );
    }

    const totalEarnings = Number(data?.total_amount) || 0;
    console.log('Successfully fetched earnings:', totalEarnings);

    return NextResponse.json(
      { totalEarnings },
      {
        headers: {
          'Cache-Control': 'private, no-cache',
        },
      }
    );

  } catch (error) {
    console.error('Earnings GET API error:', error);
    return NextResponse.json(
      { totalEarnings: 0 },
      { headers: { 'Cache-Control': 'private, no-cache' } }
    );
  }
}

// POST - Claim rewards
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
    const { reward_type, amount, user_id } = body;

    // Validate input
    if (!reward_type || !amount || amount <= 0 || !user_id) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    // Verify user_id matches session user
    if (user_id !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Make the external API call server-side
    const response = await fetch(
      'https://phpaoasgtqsnwohtevwf.supabase.co/functions/v1/add_earnings',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reward_type,
          amount,
          user_id,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('External API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to process earnings' },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-cache',
      },
    });

  } catch (error) {
    console.error('Earnings POST API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 
