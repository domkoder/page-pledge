use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

#[cfg(test)]
mod tests;

declare_id!("Dtp24PjyLpJ9Gr5TuMREoRkyRunknUjT9UW1HmiAAp3t");

pub const MAX_MILESTONES: usize = 10;
pub const MIN_MILESTONES: u8 = 2;
pub const MIN_PARTICIPANTS: u8 = 2;
pub const MAX_PARTICIPANTS: u8 = 50;
pub const MAX_COMMIT_ATTEMPTS: u8 = 3;

pub const STATUS_OPEN: u8 = 0;
pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_SETTLING: u8 = 2;
pub const STATUS_FINALIZED: u8 = 3;

#[program]
pub mod vault {
    use super::*;

    pub fn deposit(ctx: Context<VaultAction>, amount: u64) -> Result<()> {
        require!(ctx.accounts.vault.lamports() == 0, VaultError::VaultAlreadyExists);

        let rent = Rent::get()?.minimum_balance(0);
        require!(amount > rent, VaultError::InvalidAmount);

        transfer(
            CpiContext::new(
                System::id(),
                Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        Ok(())
    }

    pub fn withdraw(ctx: Context<VaultAction>) -> Result<()> {
        require!(ctx.accounts.vault.lamports() > 0, VaultError::InvalidAmount);

        let bump = ctx.bumps.vault;
        let signer_key = ctx.accounts.signer.key();
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", signer_key.as_ref(), &[bump]]];

        transfer(
            CpiContext::new_with_signer(
                System::id(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.signer.to_account_info(),
                },
                signer_seeds,
            ),
            ctx.accounts.vault.lamports(),
        )?;

        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_cohort(
        ctx: Context<CreateCohort>,
        id: String,
        title: String,
        stake_lamports: u64,
        milestone_count: u8,
        max_participants: u8,
        interval_seconds: i64,
        grace_period_seconds: i64,
        content_hash: [u8; 32],
        oracle_pubkey: [u8; 32],
        treasury: Pubkey,
    ) -> Result<()> {
        require!(
            (MIN_MILESTONES..=MAX_MILESTONES as u8).contains(&milestone_count),
            VaultError::CohortNotOpen
        );
        require!(
            (MIN_PARTICIPANTS..=MAX_PARTICIPANTS).contains(&max_participants),
            VaultError::CohortNotOpen
        );
        require!(stake_lamports > 0, VaultError::InvalidAmount);
        require!(interval_seconds > 0, VaultError::InvalidAmount);
        require!(grace_period_seconds >= 0, VaultError::InvalidAmount);

        let clock = Clock::get()?;
        let rent_min = Rent::get()?.minimum_balance(0);

        let current_vault_lamports = ctx.accounts.vault.lamports();
        if current_vault_lamports < rent_min {
            let needed = rent_min - current_vault_lamports;
            transfer(
                CpiContext::new(
                    System::id(),
                    Transfer {
                        from: ctx.accounts.creator.to_account_info(),
                        to: ctx.accounts.vault.to_account_info(),
                    },
                ),
                needed,
            )?;
        }

        let vault_reserve = ctx.accounts.vault.lamports();
        let deadlines = compute_deadlines(clock.unix_timestamp, interval_seconds, milestone_count);

        let cohort = &mut ctx.accounts.cohort;
        cohort.id = id;
        cohort.title = title;
        cohort.creator = ctx.accounts.creator.key();
        cohort.epoch = clock.unix_timestamp;
        cohort.stake = stake_lamports;
        cohort.milestone_count = milestone_count;
        cohort.max_participants = max_participants;
        cohort.interval_seconds = interval_seconds;
        cohort.deadlines = deadlines;
        cohort.grace_period_seconds = grace_period_seconds;
        cohort.content_hash = content_hash;
        cohort.oracle_pubkey = oracle_pubkey;
        cohort.treasury = treasury;
        cohort.vault_rent_reserve = vault_reserve;
        cohort.status = STATUS_OPEN;
        cohort.started_at = 0;
        cohort.last_oracle_ts = 0;
        cohort.participant_count = 0;
        cohort.total_deposits = 0;
        cohort.settled_count = 0;
        cohort.total_forfeits = 0;
        cohort.total_bounties_paid = 0;
        cohort.total_net_forfeits = 0;
        cohort.eligible_count = 0;
        cohort.eligible_stake_sum = 0;
        cohort.total_preserved_stakes = 0;
        cohort.total_no_eligible_refunds = 0;
        cohort.finalized_assets = 0;
        cohort.finalized_liabilities = 0;
        cohort.finalized_pool = 0;
        cohort.finalized_fee = 0;
        cohort.finalized_dust = 0;
        cohort.bump = ctx.bumps.cohort;
        cohort.vault_bump = ctx.bumps.vault;

        Ok(())
    }

    pub fn join(ctx: Context<JoinCohort>) -> Result<()> {
        let cohort = &mut ctx.accounts.cohort;
        require!(cohort.status == STATUS_OPEN, VaultError::CohortNotOpen);
        require!(
            cohort.participant_count < cohort.max_participants,
            VaultError::CohortFull
        );

        let participant = &mut ctx.accounts.participant;
        require!(
            participant.cohort == Pubkey::default(),
            VaultError::AlreadyJoined
        );

        let stake = cohort.stake;
        require!(
            ctx.accounts.user.lamports() >= stake,
            VaultError::InsufficientBalance
        );

        transfer(
            CpiContext::new(
                System::id(),
                Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            stake,
        )?;

        let clock = Clock::get()?;
        participant.cohort = cohort.key();
        participant.user = ctx.accounts.user.key();
        participant.stake = stake;
        participant.joined_at = clock.unix_timestamp;
        participant.completed_bitmap = 0;
        participant.attempt_counts = [0; MAX_MILESTONES];
        participant.commit_timestamps = [0; MAX_MILESTONES];
        participant.answer_hashes = [[0; 32]; MAX_MILESTONES];
        participant.settled = false;
        participant.missed_count = 0;
        participant.forfeit = 0;
        participant.bounty_paid = 0;
        participant.net_forfeit = 0;
        participant.eligible = false;
        participant.claimed = false;
        participant.payout = 0;
        participant.bump = ctx.bumps.participant;

        cohort.participant_count = cohort
            .participant_count
            .checked_add(1)
            .ok_or(VaultError::CohortFull)?;
        cohort.total_deposits = cohort
            .total_deposits
            .checked_add(stake)
            .ok_or(VaultError::InvalidAmount)?;

        Ok(())
    }

    pub fn start_cohort(ctx: Context<StartCohort>) -> Result<()> {
        let cohort = &mut ctx.accounts.cohort;
        require!(cohort.status == STATUS_OPEN, VaultError::CohortNotOpen);
        require!(
            cohort.participant_count >= MIN_PARTICIPANTS,
            VaultError::MinParticipantsNotMet
        );

        let caller_key = ctx.accounts.caller.key();
        if caller_key != cohort.creator {
            let p_info = ctx.accounts.participant.to_account_info();
            require!(p_info.owner == &crate::ID, VaultError::WrongUser);
            let data = p_info.try_borrow_data()?;
            let mut slice: &[u8] = &data;
            let p_state =
                Participant::try_deserialize(&mut slice).map_err(|_| VaultError::WrongUser)?;
            require!(
                p_state.cohort == cohort.key() && p_state.user == caller_key,
                VaultError::WrongUser
            );
        }

        let clock = Clock::get()?;
        activate_cohort_schedule(cohort, clock.unix_timestamp);

        Ok(())
    }

    pub fn commit_submission(
        ctx: Context<CommitSubmission>,
        milestone_idx: u8,
        answer_hash: [u8; 32],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let cohort = &mut ctx.accounts.cohort;

        if cohort.status == STATUS_OPEN {
            require!(
                cohort.participant_count >= MIN_PARTICIPANTS,
                VaultError::CohortNotOpen
            );
            activate_cohort_schedule(cohort, clock.unix_timestamp);
        }

        require!(cohort.status == STATUS_ACTIVE, VaultError::CohortNotOpen);
        require!(
            milestone_idx < cohort.milestone_count,
            VaultError::SubmissionWindowClosed
        );

        let participant = &mut ctx.accounts.participant;
        require!(
            participant.cohort == cohort.key() && participant.user == ctx.accounts.user.key(),
            VaultError::WrongUser
        );

        let idx = milestone_idx as usize;
        let bit_set = (participant.completed_bitmap & (1u16 << milestone_idx)) != 0;
        require!(!bit_set, VaultError::AlreadyCompleted);

        require!(
            clock.unix_timestamp <= cohort.deadlines[idx],
            VaultError::SubmissionWindowClosed
        );
        require!(
            participant.attempt_counts[idx] < MAX_COMMIT_ATTEMPTS,
            VaultError::MaxAttemptsExceeded
        );

        participant.answer_hashes[idx] = answer_hash;
        participant.commit_timestamps[idx] = clock.unix_timestamp;
        participant.attempt_counts[idx] = participant.attempt_counts[idx]
            .checked_add(1)
            .ok_or(VaultError::MaxAttemptsExceeded)?;

        Ok(())
    }
}

fn compute_deadlines(base_ts: i64, interval_seconds: i64, milestone_count: u8) -> [i64; MAX_MILESTONES] {
    let mut deadlines = [0i64; MAX_MILESTONES];
    for (i, slot) in deadlines
        .iter_mut()
        .enumerate()
        .take(milestone_count as usize)
    {
        *slot = base_ts.saturating_add(interval_seconds.saturating_mul((i as i64) + 1));
    }
    deadlines
}

fn activate_cohort_schedule(cohort: &mut Cohort, now: i64) {
    cohort.status = STATUS_ACTIVE;
    cohort.started_at = now;
    cohort.deadlines = compute_deadlines(now, cohort.interval_seconds, cohort.milestone_count);
}

#[account]
#[derive(InitSpace)]
pub struct Cohort {
    #[max_len(32)]
    pub id: String,
    #[max_len(64)]
    pub title: String,
    pub creator: Pubkey,
    pub epoch: i64,
    pub stake: u64,
    pub milestone_count: u8,
    pub max_participants: u8,
    pub interval_seconds: i64,
    pub deadlines: [i64; MAX_MILESTONES],
    pub grace_period_seconds: i64,
    pub content_hash: [u8; 32],
    pub oracle_pubkey: [u8; 32],
    pub treasury: Pubkey,
    pub vault_rent_reserve: u64,
    pub status: u8,
    pub started_at: i64,
    pub last_oracle_ts: i64,
    pub participant_count: u8,
    pub total_deposits: u64,
    pub settled_count: u8,
    pub total_forfeits: u64,
    pub total_bounties_paid: u64,
    pub total_net_forfeits: u64,
    pub eligible_count: u8,
    pub eligible_stake_sum: u64,
    pub total_preserved_stakes: u64,
    pub total_no_eligible_refunds: u64,
    pub finalized_assets: u64,
    pub finalized_liabilities: u64,
    pub finalized_pool: u64,
    pub finalized_fee: u64,
    pub finalized_dust: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Participant {
    pub cohort: Pubkey,
    pub user: Pubkey,
    pub stake: u64,
    pub joined_at: i64,
    pub completed_bitmap: u16,
    pub attempt_counts: [u8; MAX_MILESTONES],
    pub commit_timestamps: [i64; MAX_MILESTONES],
    pub answer_hashes: [[u8; 32]; MAX_MILESTONES],
    pub settled: bool,
    pub missed_count: u8,
    pub forfeit: u64,
    pub bounty_paid: u64,
    pub net_forfeit: u64,
    pub eligible: bool,
    pub claimed: bool,
    pub payout: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct VaultAction<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault", signer.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id: String)]
pub struct CreateCohort<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Cohort::INIT_SPACE,
        seeds = [b"cohort", creator.key().as_ref(), id.as_bytes()],
        bump,
    )]
    pub cohort: Account<'info, Cohort>,
    #[account(
        mut,
        seeds = [b"vault", cohort.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinCohort<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"cohort", cohort.creator.as_ref(), cohort.id.as_bytes()],
        bump = cohort.bump,
    )]
    pub cohort: Account<'info, Cohort>,
    #[account(
        mut,
        seeds = [b"vault", cohort.key().as_ref()],
        bump = cohort.vault_bump,
    )]
    pub vault: SystemAccount<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Participant::INIT_SPACE,
        seeds = [b"participant", cohort.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub participant: Account<'info, Participant>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartCohort<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"cohort", cohort.creator.as_ref(), cohort.id.as_bytes()],
        bump = cohort.bump,
    )]
    pub cohort: Account<'info, Cohort>,
    /// CHECK: Validated in handler when caller != cohort.creator
    #[account(
        seeds = [b"participant", cohort.key().as_ref(), caller.key().as_ref()],
        bump,
    )]
    pub participant: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CommitSubmission<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"cohort", cohort.creator.as_ref(), cohort.id.as_bytes()],
        bump = cohort.bump,
    )]
    pub cohort: Account<'info, Cohort>,
    #[account(
        mut,
        seeds = [b"participant", cohort.key().as_ref(), user.key().as_ref()],
        bump = participant.bump,
    )]
    pub participant: Account<'info, Participant>,
}

#[error_code]
pub enum VaultError {
    #[msg("Vault already exists")]
    VaultAlreadyExists,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("WrongUser")]
    WrongUser,
    #[msg("WrongCohort")]
    WrongCohort,
    #[msg("AttestationExpired")]
    AttestationExpired,
    #[msg("ScoreTooLow")]
    ScoreTooLow,
    #[msg("AlreadyCompleted")]
    AlreadyCompleted,
    #[msg("SubmissionWindowClosed")]
    SubmissionWindowClosed,
    #[msg("NotCommitted")]
    NotCommitted,
    #[msg("SettlementTooEarly")]
    SettlementTooEarly,
    #[msg("AlreadySettled")]
    AlreadySettled,
    #[msg("NotFinalized")]
    NotFinalized,
    #[msg("AlreadyClaimed")]
    AlreadyClaimed,
    #[msg("BadSignature")]
    BadSignature,
    #[msg("CohortNotOpen")]
    CohortNotOpen,
    #[msg("CohortFull")]
    CohortFull,
    #[msg("MinParticipantsNotMet")]
    MinParticipantsNotMet,
    #[msg("MaxAttemptsExceeded")]
    MaxAttemptsExceeded,
    #[msg("AlreadyJoined")]
    AlreadyJoined,
    #[msg("InsufficientBalance")]
    InsufficientBalance,
    #[msg("NotAllUsersSettled")]
    NotAllUsersSettled,
    #[msg("AlreadyFinalized")]
    AlreadyFinalized,
}

pub type ChainErrorCode = VaultError;
