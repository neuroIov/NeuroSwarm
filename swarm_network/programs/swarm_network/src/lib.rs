use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use borsh::{BorshDeserialize, BorshSerialize};

declare_id!("Fo3vZZN71E9Uf5qiCK1C3jiVui4TbDa68wqwkqMpEbdY");

#[program]
pub mod swarm_network {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, bump: u8, decimals: u8) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.bump = bump;

        // Initialize NLOV token mint
        let mint = &ctx.accounts.token_mint;
        let mint_authority = ctx.accounts.authority.key();
        token::initialize_mint(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::InitializeMint {
                    mint: mint.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            decimals,
            &mint_authority, // Borrow the Pubkey
            Some(&mint_authority), // Borrow the Pubkey in Option
        )?;

        // Initialize reward pool
        let reward_pool = &ctx.accounts.reward_pool;
        token::initialize_account(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::InitializeAccount {
                account: reward_pool.to_account_info(),
                mint: mint.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        ))?;

        // Initialize stake pool
        let stake_pool = &ctx.accounts.stake_pool;
        token::initialize_account(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::InitializeAccount {
                account: stake_pool.to_account_info(),
                mint: mint.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        ))?;

        state.token_mint = mint.key();
        state.reward_pool = reward_pool.key();
        state.stake_pool = stake_pool.key();
        state.total_staked = 0;
        state.total_rewards_distributed = 0;

        Ok(())
    }

    pub fn register_device(
        ctx: Context<RegisterDevice>,
        gpu_model: String,
        vram: u64,
        hash_rate: u64,
        referrer: Option<Pubkey>,
    ) -> Result<()> {
        require!(gpu_model.len() <= 64, ErrorCode::InvalidStringLength);
        let device = &mut ctx.accounts.device;
        device.owner = ctx.accounts.owner.key();
        device.gpu_model = gpu_model;
        device.vram = vram;
        device.hash_rate = hash_rate;
        device.is_active = true;
        device.last_active = Clock::get()?.unix_timestamp as u64;
        device.total_rewards = 0;
        device.referrer = referrer;
        device.referral_rewards = 0;
        Ok(())
    }

    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: String,
        requirements: TaskRequirements,
    ) -> Result<()> {
        require!(task_id.len() <= 64, ErrorCode::InvalidStringLength);
        let task = &mut ctx.accounts.task;
        task.owner = ctx.accounts.owner.key();
        task.task_id = task_id;
        task.requirements = requirements;
        task.assigned_device = None;
        task.status = String::from("pending");
        task.start_time = Clock::get()?.unix_timestamp as u64;
        task.end_time = None;
        task.result = None;
        Ok(())
    }

    pub fn assign_task(ctx: Context<AssignTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        task.assigned_device = Some(ctx.accounts.device.key());
        task.status = String::from("processing");
        Ok(())
    }

    pub fn complete_task(ctx: Context<CompleteTask>, result: TaskResult) -> Result<()> {
        let task = &mut ctx.accounts.task;
        task.result = Some(result);
        task.status = String::from("completed");
        task.end_time = Some(Clock::get()?.unix_timestamp as u64);
        Ok(())
    }

    pub fn distribute_reward(ctx: Context<DistributeReward>, amount: u64) -> Result<()> {
        let device = &mut ctx.accounts.device;
        let state = &mut ctx.accounts.state;

        // Transfer reward to device owner
        let cpi_program = ctx.accounts.token_program.to_account_info(); // Clone to reuse
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.reward_pool.to_account_info(),
            to: ctx.accounts.device_owner.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program.clone(), cpi_accounts); // Clone cpi_program
        token::transfer(cpi_ctx, amount)?;

        // Update reward stats
        device.total_rewards = device.total_rewards.checked_add(amount).unwrap();
        state.total_rewards_distributed =
            state.total_rewards_distributed.checked_add(amount).unwrap();

        // Handle referral reward if applicable
        if let Some(referrer) = device.referrer {
            let referral_amount = amount.checked_mul(5).unwrap().checked_div(100).unwrap(); // 5% referral reward
            if referral_amount > 0 {
                if let Some(referrer_account) = &ctx.accounts.referrer_account {
                    let referral_cpi_accounts = token::Transfer {
                        from: ctx.accounts.reward_pool.to_account_info(),
                        to: referrer_account.to_account_info(), // Safely unwrap and get AccountInfo
                        authority: ctx.accounts.authority.to_account_info(),
                    };
                    let referral_cpi_ctx = CpiContext::new(cpi_program, referral_cpi_accounts); // Reuse cloned cpi_program
                    token::transfer(referral_cpi_ctx, referral_amount)?;
                    device.referral_rewards = device
                        .referral_rewards
                        .checked_add(referral_amount)
                        .unwrap();
                }
            }
        }

        Ok(())
    }

    pub fn update_device_status(ctx: Context<UpdateDevice>, is_active: bool) -> Result<()> {
        let device = &mut ctx.accounts.device;
        device.is_active = is_active;
        device.last_active = Clock::get()?.unix_timestamp as u64;
        Ok(())
    }

    pub fn stake_tokens(ctx: Context<StakeTokens>, amount: u64) -> Result<()> {
        let device = &mut ctx.accounts.device;
        let state = &mut ctx.accounts.state;

        // Validate stake pool
        require!(
            ctx.accounts.stake_pool.key() == state.stake_pool,
            ErrorCode::InvalidStakePool
        );

        // Transfer tokens from user to stake pool
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.stake_pool.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Update stake stats
        device.staked_amount = device.staked_amount.checked_add(amount).unwrap();
        state.total_staked = state.total_staked.checked_add(amount).unwrap();

        Ok(())
    }

    pub fn claim_referral_rewards(ctx: Context<ClaimReferral>) -> Result<()> {
        let device = &mut ctx.accounts.device;
        let state = &mut ctx.accounts.state;

        // Calculate unclaimed rewards
        let unclaimed = device.referral_rewards;
        require!(unclaimed > 0, ErrorCode::NoRewardsToClaim);

        // Transfer rewards
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.reward_pool.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, unclaimed)?;

        // Reset unclaimed rewards
        device.referral_rewards = 0;

        Ok(())
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("String length exceeds maximum allowed size")]
    InvalidStringLength,
    #[msg("No rewards available to claim")]
    NoRewardsToClaim,
    #[msg("Invalid stake pool account")]
    InvalidStakePool,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        seeds = [b"state"],
        bump,
        payer = authority,
        space = 89 // 8 (discriminator) + 32 (Pubkey) + 1 (u8) + 32 (Pubkey) + 32 (Pubkey) + 8 (u64) + 8 (u64)
    )]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,
    #[account(mut)]
    pub reward_pool: Account<'info, TokenAccount>,
    #[account(
        init,
        seeds = [b"stake_pool"],
        bump,
        payer = authority,
        token::mint = token_mint,
        token::authority = authority
    )]
    pub stake_pool: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RegisterDevice<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        seeds = [b"device", owner.key().as_ref()],
        bump,
        payer = owner,
        space = 133 // 8 (discriminator) + 32 (Pubkey) + 68 (String<64>) + 8 (u64) + 8 (u64) + 1 (bool) + 8 (u64)
    )]
    pub device: Account<'info, Device>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateTask<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        seeds = [b"task", owner.key().as_ref(), &owner.key().to_bytes()],
        bump,
        payer = owner,
        space = 479 // 8 (discriminator) + 32 (Pubkey) + 68 (String<64>) + 24 (TaskRequirements) + 33 (Option<Pubkey>) + 260 (String<256>) + 8 (u64) + 9 (Option<u64>) + 17 (Option<TaskResult>)
    )]
    pub task: Account<'info, Task>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AssignTask<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
    #[account(mut)]
    pub device: Account<'info, Device>,
}

#[derive(Accounts)]
pub struct CompleteTask<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
}

#[derive(Accounts)]
pub struct DistributeReward<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = reward_pool.mint == state.token_mint,
        constraint = reward_pool.key() == state.reward_pool
    )]
    pub reward_pool: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = device_owner.mint == state.token_mint
    )]
    pub device_owner: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = device.owner == device_owner.owner
    )]
    pub device: Account<'info, Device>,
    #[account(
        seeds = [b"state"],
        bump = state.bump
    )]
    pub state: Account<'info, State>,
    /// CHECK: Optional referrer token account, validated if referrer exists
    #[account(mut)]
    pub referrer_account: Option<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateDevice<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        constraint = device.owner == owner.key()
    )]
    pub device: Account<'info, Device>,
}

#[derive(Accounts)]
pub struct StakeTokens<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        constraint = device.owner == user.key()
    )]
    pub device: Account<'info, Device>,
    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == state.token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = stake_pool.mint == state.token_mint
    )]
    pub stake_pool: Account<'info, TokenAccount>,
    #[account(
        seeds = [b"state"],
        bump = state.bump
    )]
    pub state: Account<'info, State>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimReferral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        constraint = device.owner == user.key(),
        constraint = device.referral_rewards > 0
    )]
    pub device: Account<'info, Device>,
    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == state.token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = reward_pool.mint == state.token_mint,
        constraint = reward_pool.key() == state.reward_pool
    )]
    pub reward_pool: Account<'info, TokenAccount>,
    #[account(
        seeds = [b"state"],
        bump = state.bump
    )]
    pub state: Account<'info, State>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct State {
    pub authority: Pubkey,
    pub bump: u8,
    pub token_mint: Pubkey,
    pub reward_pool: Pubkey,
    pub stake_pool: Pubkey,
    pub total_staked: u64,
    pub total_rewards_distributed: u64,
}

#[account]
pub struct Device {
    pub owner: Pubkey,
    pub gpu_model: String, // Max 64 chars (4 length + 64 data)
    pub vram: u64,
    pub hash_rate: u64,
    pub is_active: bool,
    pub last_active: u64,
    pub total_rewards: u64,
    pub referrer: Option<Pubkey>,
    pub referral_rewards: u64,
    pub staked_amount: u64,
}

#[account]
pub struct Task {
    pub owner: Pubkey,
    pub task_id: String, // Max 64 chars (4 length + 64 data)
    pub requirements: TaskRequirements,
    pub assigned_device: Option<Pubkey>, // 33 bytes (1 discriminant + 32 Pubkey)
    pub status: String,                  // Max 256 chars (4 length + 256 data)
    pub start_time: u64,
    pub end_time: Option<u64>,      // 9 bytes (1 discriminant + 8 u64)
    pub result: Option<TaskResult>, // 17 bytes (1 discriminant + 16 TaskResult)
    pub reward_amount: u64,         // Reward for completing this task
}

#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct TaskRequirements {
    pub min_vram: u64,
    pub min_hash_rate: u64,
    pub priority: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct TaskResult {
    pub compute_time: u64,
    pub hash_rate: u64,
    pub success: bool,
}