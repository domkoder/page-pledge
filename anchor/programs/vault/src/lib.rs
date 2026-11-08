use anchor_lang::prelude::*;
use solana_instructions_sysvar::{
    load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_SYSVAR_ID,
};
use anchor_lang::system_program::{transfer, Transfer};

#[cfg(test)]
mod tests;

declare_id!("F4jZpgbtTb6RWNWq6v35fUeiAsRJMrDczVPv9U23yXjB");

pub const MAX_MILESTONES: usize = 10;
pub const MIN_MILESTONES: u8 = 2;
pub const MIN_PARTICIPANTS: u8 = 2;
pub const MAX_PARTICIPANTS: u8 = 50;
pub const MAX_COMMIT_ATTEMPTS: u8 = 3;
pub const MIN_PASSING_SCORE: u8 = 75;
pub const ATTESTATION_DOMAIN: &str = "PAGEPLEDGE_ATT_V1";
pub const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

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
        cohort.claimed_count = 0;
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

    pub fn complete_milestone(
        ctx: Context<CompleteMilestone>,
        milestone_idx: u8,
        score: u8,
        expires_at: i64,
        signature: [u8; 64],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let cohort = &mut ctx.accounts.cohort;
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

        let commit_ts = participant.commit_timestamps[idx];
        let commit_hash = participant.answer_hashes[idx];
        require!(
            participant.attempt_counts[idx] > 0 && commit_ts > 0 && commit_hash != [0u8; 32],
            VaultError::NotCommitted
        );

        let deadline = cohort.deadlines[idx];
        let grace_end = deadline.saturating_add(cohort.grace_period_seconds);
        require!(
            commit_ts <= deadline && clock.unix_timestamp <= grace_end,
            VaultError::SubmissionWindowClosed
        );

        require!(
            clock.unix_timestamp <= expires_at,
            VaultError::AttestationExpired
        );
        require!(score >= MIN_PASSING_SCORE, VaultError::ScoreTooLow);

        let expected_payload = build_attestation_payload(
            &crate::ID,
            "devnet",
            &cohort.id,
            cohort.epoch,
            &ctx.accounts.user.key(),
            milestone_idx,
            score,
            &commit_hash,
            expires_at,
        );

        verify_ed25519_sysvar_attestation(
            &ctx.accounts.instructions_sysvar.to_account_info(),
            &cohort.oracle_pubkey,
            &signature,
            &expected_payload,
            &cohort.id,
            cohort.epoch,
            &ctx.accounts.user.key(),
        )?;

        participant.completed_bitmap |= 1u16 << milestone_idx;
        cohort.last_oracle_ts = clock.unix_timestamp;

        Ok(())
    }

    /// Permissionless per-participant settlement after the final milestone window closes.
    /// Classifies each milestone as PASSED / NEUTRAL / MISSED (ADR 0011), pays the keeper bounty
    /// from the Vault, and folds the result into O(1) cohort accumulators (ADR 0013, ADR 0014).
    pub fn settle_user(ctx: Context<SettleUser>) -> Result<()> {
        let clock = Clock::get()?;
        let cohort_key = ctx.accounts.cohort.key();
        let cohort = &mut ctx.accounts.cohort;
        require!(
            cohort.status == STATUS_ACTIVE || cohort.status == STATUS_SETTLING,
            VaultError::SettlementTooEarly
        );

        let m = cohort.milestone_count as usize;
        let window_close = cohort.deadlines[m - 1].saturating_add(cohort.grace_period_seconds);
        require!(
            clock.unix_timestamp > window_close,
            VaultError::SettlementTooEarly
        );

        let participant = &mut ctx.accounts.participant;
        require!(!participant.settled, VaultError::AlreadySettled);

        if cohort.status == STATUS_ACTIVE {
            cohort.status = STATUS_SETTLING;
        }

        let (passed_count, missed_count) = classify_milestones(cohort, participant);
        let stake = participant.stake;
        let forfeit = compute_forfeit(stake, missed_count, cohort.milestone_count);
        let bounty = compute_settle_bounty(forfeit);
        let net_forfeit = forfeit - bounty;
        let eligible = passed_count == cohort.milestone_count && missed_count == 0;

        participant.settled = true;
        participant.missed_count = missed_count;
        participant.forfeit = forfeit;
        participant.bounty_paid = bounty;
        participant.net_forfeit = net_forfeit;
        participant.eligible = eligible;

        cohort.settled_count = cohort
            .settled_count
            .checked_add(1)
            .ok_or(VaultError::InvalidAmount)?;
        cohort.total_forfeits = checked_add(cohort.total_forfeits, forfeit)?;
        cohort.total_bounties_paid = checked_add(cohort.total_bounties_paid, bounty)?;
        cohort.total_net_forfeits = checked_add(cohort.total_net_forfeits, net_forfeit)?;
        if eligible {
            cohort.eligible_count = cohort
                .eligible_count
                .checked_add(1)
                .ok_or(VaultError::InvalidAmount)?;
            cohort.eligible_stake_sum = checked_add(cohort.eligible_stake_sum, stake)?;
        }
        cohort.total_preserved_stakes = checked_add(cohort.total_preserved_stakes, stake - forfeit)?;
        cohort.total_no_eligible_refunds = checked_add(
            cohort.total_no_eligible_refunds,
            mul_div(net_forfeit, BPS_DENOMINATOR - PROTOCOL_FEE_BPS, BPS_DENOMINATOR),
        )?;
        let vault_bump = cohort.vault_bump;

        transfer_from_vault(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.caller.to_account_info(),
            &cohort_key,
            vault_bump,
            bounty,
        )
    }

    /// Permissionless O(1) finalization: locks assets / liabilities / fee / pool from the cohort
    /// accumulators and sweeps `fee + dust` to the Treasury. No remaining_accounts.
    pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
        let cohort_key = ctx.accounts.cohort.key();
        let vault_lamports = ctx.accounts.vault.lamports();
        let cohort = &mut ctx.accounts.cohort;
        require!(
            cohort.status != STATUS_FINALIZED,
            VaultError::AlreadyFinalized
        );
        require!(
            cohort.participant_count > 0 && cohort.settled_count == cohort.participant_count,
            VaultError::NotAllUsersSettled
        );

        let assets = vault_lamports.saturating_sub(cohort.vault_rent_reserve);
        let liabilities = cohort
            .total_deposits
            .saturating_sub(cohort.total_bounties_paid);

        let raw_fee = mul_div(cohort.total_net_forfeits, PROTOCOL_FEE_BPS, BPS_DENOMINATOR);
        let fee = apply_haircut(raw_fee, assets, liabilities);
        let yield_amount = assets.saturating_sub(liabilities);
        let nobody_eligible = cohort.eligible_stake_sum == 0;

        let pool = if nobody_eligible {
            0
        } else {
            apply_haircut(cohort.total_net_forfeits - raw_fee, assets, liabilities)
                .saturating_add(yield_amount)
        };

        // Aggregate payouts are an exact upper bound on sum(per-claim floors); any per-claim
        // flooring residual is swept to Treasury by the final claim so the invariant
        // sum(payouts) + fee + dust == A holds to the lamport.
        let preserved_total = apply_haircut(cohort.total_preserved_stakes, assets, liabilities);
        let reward_total = if nobody_eligible {
            apply_haircut(cohort.total_no_eligible_refunds, assets, liabilities)
        } else {
            pool
        };
        let total_payouts = preserved_total.saturating_add(reward_total);
        let dust = assets.saturating_sub(total_payouts.saturating_add(fee));

        cohort.finalized_assets = assets;
        cohort.finalized_liabilities = liabilities;
        cohort.finalized_pool = pool;
        cohort.finalized_fee = fee;
        cohort.finalized_dust = dust;
        cohort.status = STATUS_FINALIZED;
        let vault_bump = cohort.vault_bump;

        transfer_from_vault(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.treasury.to_account_info(),
            &cohort_key,
            vault_bump,
            fee.saturating_add(dust),
        )
    }

    /// Participant claims their exact payout once the cohort is finalized.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let cohort_key = ctx.accounts.cohort.key();
        let cohort = &mut ctx.accounts.cohort;
        require!(cohort.status == STATUS_FINALIZED, VaultError::NotFinalized);

        let participant = &mut ctx.accounts.participant;
        require!(!participant.claimed, VaultError::AlreadyClaimed);

        let payout = compute_payout(cohort, participant);
        participant.claimed = true;
        participant.payout = payout;
        cohort.claimed_count = cohort
            .claimed_count
            .checked_add(1)
            .ok_or(VaultError::InvalidAmount)?;
        let is_last_claim = cohort.claimed_count == cohort.participant_count;
        let vault_bump = cohort.vault_bump;
        let reserve = cohort.vault_rent_reserve;

        let vault_info = ctx.accounts.vault.to_account_info();
        transfer_from_vault(
            &vault_info,
            &ctx.accounts.user.to_account_info(),
            &cohort_key,
            vault_bump,
            payout,
        )?;

        if is_last_claim {
            let residual = vault_info.lamports().saturating_sub(reserve);
            if residual > 0 {
                transfer_from_vault(
                    &vault_info,
                    &ctx.accounts.treasury.to_account_info(),
                    &cohort_key,
                    vault_bump,
                    residual,
                )?;
                let cohort = &mut ctx.accounts.cohort;
                cohort.finalized_dust = checked_add(cohort.finalized_dust, residual)?;
            }
        }

        Ok(())
    }
}

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const PROTOCOL_FEE_BPS: u64 = 200;
pub const SETTLE_BOUNTY_BPS: u64 = 100;
pub const MAX_SETTLE_BOUNTY: u64 = 10_000_000;

fn checked_add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or_else(|| error!(VaultError::InvalidAmount))
}

/// floor(a * b / d) computed in u128; result always fits u64 when b <= d.
fn mul_div(a: u64, b: u64, d: u64) -> u64 {
    if d == 0 {
        return 0;
    }
    ((a as u128 * b as u128) / d as u128) as u64
}

/// Haircut h = min(1, A / U) applied with floor division (mirrors lib/economics.ts applyHaircut).
fn apply_haircut(amount: u64, assets: u64, liabilities: u64) -> u64 {
    if amount == 0 || liabilities == 0 {
        return 0;
    }
    if assets >= liabilities {
        return amount;
    }
    mul_div(amount, assets, liabilities)
}

/// F_i = floor(S_i * missed_i / M)
fn compute_forfeit(stake: u64, missed_count: u8, milestone_count: u8) -> u64 {
    if missed_count == 0 || milestone_count == 0 {
        return 0;
    }
    if missed_count >= milestone_count {
        return stake;
    }
    mul_div(stake, missed_count as u64, milestone_count as u64)
}

/// bounty_i = min(floor(F_i * 100 / 10_000), 10_000_000)
fn compute_settle_bounty(forfeit: u64) -> u64 {
    mul_div(forfeit, SETTLE_BOUNTY_BPS, BPS_DENOMINATOR).min(MAX_SETTLE_BOUNTY)
}

/// Returns (passed_count, missed_count) per ADR 0011:
/// PASSED if bit set; NEUTRAL if committed on time and the oracle was silent since that commit
/// (`last_oracle_ts < commit_ts`); MISSED otherwise.
fn classify_milestones(cohort: &Cohort, participant: &Participant) -> (u8, u8) {
    let mut passed = 0u8;
    let mut missed = 0u8;
    for i in 0..cohort.milestone_count as usize {
        if participant.completed_bitmap & (1u16 << i) != 0 {
            passed += 1;
            continue;
        }
        let commit_ts = participant.commit_timestamps[i];
        let neutral = commit_ts > 0
            && commit_ts <= cohort.deadlines[i]
            && cohort.last_oracle_ts < commit_ts;
        if !neutral {
            missed += 1;
        }
    }
    (passed, missed)
}

/// payout_i = floor(h * (S_i - F_i)) + rewardShare_i (mirrors lib/economics.ts).
fn compute_payout(cohort: &Cohort, participant: &Participant) -> u64 {
    let assets = cohort.finalized_assets;
    let liabilities = cohort.finalized_liabilities;
    let preserved = apply_haircut(
        participant.stake.saturating_sub(participant.forfeit),
        assets,
        liabilities,
    );
    let reward = if cohort.eligible_stake_sum == 0 {
        apply_haircut(
            mul_div(
                participant.net_forfeit,
                BPS_DENOMINATOR - PROTOCOL_FEE_BPS,
                BPS_DENOMINATOR,
            ),
            assets,
            liabilities,
        )
    } else if participant.eligible {
        mul_div(
            cohort.finalized_pool,
            participant.stake,
            cohort.eligible_stake_sum,
        )
    } else {
        0
    };
    preserved.saturating_add(reward)
}

fn transfer_from_vault<'info>(
    vault: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    cohort_key: &Pubkey,
    vault_bump: u8,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let bump = [vault_bump];
    let seeds: [&[u8]; 3] = [b"vault", cohort_key.as_ref(), &bump];
    let signer_seeds: [&[&[u8]]; 1] = [&seeds];
    transfer(
        CpiContext::new_with_signer(
            System::id(),
            Transfer {
                from: vault.clone(),
                to: to.clone(),
            },
            &signer_seeds,
        ),
        amount,
    )
}

fn hex_encode_32(bytes: &[u8; 32]) -> String {
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";
    let mut out = Vec::with_capacity(64);
    for &b in bytes {
        out.push(HEX_CHARS[(b >> 4) as usize]);
        out.push(HEX_CHARS[(b & 0x0f) as usize]);
    }
    String::from_utf8(out).unwrap_or_default()
}

#[allow(clippy::too_many_arguments)]
fn build_attestation_payload(
    program_id: &Pubkey,
    cluster_id: &str,
    cohort_id: &str,
    cohort_epoch: i64,
    user: &Pubkey,
    milestone_idx: u8,
    score: u8,
    commit_hash: &[u8; 32],
    expires_at: i64,
) -> Vec<u8> {
    let commit_hex = hex_encode_32(commit_hash);
    format!(
        "{}||{}||{}||{}||{}||{}||{}||{}||{}||{}",
        ATTESTATION_DOMAIN,
        program_id,
        cluster_id,
        cohort_id,
        cohort_epoch,
        user,
        milestone_idx,
        score,
        commit_hex,
        expires_at
    )
    .into_bytes()
}

fn verify_ed25519_sysvar_attestation(
    instructions_sysvar: &AccountInfo,
    expected_oracle_pubkey: &[u8; 32],
    expected_signature: &[u8; 64],
    expected_payload: &[u8],
    expected_cohort_id: &str,
    expected_cohort_epoch: i64,
    expected_user: &Pubkey,
) -> Result<()> {
    let current_idx = load_current_index_checked(instructions_sysvar)
        .map_err(|_| error!(VaultError::BadSignature))?;
    require!(current_idx > 0, VaultError::BadSignature);

    let ed_ix = load_instruction_at_checked((current_idx - 1) as usize, instructions_sysvar)
        .map_err(|_| error!(VaultError::BadSignature))?;

    require!(
        ed_ix.program_id == ED25519_PROGRAM_ID && ed_ix.accounts.is_empty(),
        VaultError::BadSignature
    );

    let data = &ed_ix.data;
    require!(data.len() >= 16, VaultError::BadSignature);
    require!(data[0] == 1 && data[1] == 0, VaultError::BadSignature);

    let sig_offset = u16::from_le_bytes([data[2], data[3]]) as usize;
    let sig_ix_idx = u16::from_le_bytes([data[4], data[5]]);
    let pk_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let pk_ix_idx = u16::from_le_bytes([data[8], data[9]]);
    let msg_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_size = u16::from_le_bytes([data[12], data[13]]) as usize;
    let msg_ix_idx = u16::from_le_bytes([data[14], data[15]]);

    require!(
        sig_ix_idx == u16::MAX && pk_ix_idx == u16::MAX && msg_ix_idx == u16::MAX,
        VaultError::BadSignature
    );
    require!(
        pk_offset.saturating_add(32) <= data.len()
            && sig_offset.saturating_add(64) <= data.len()
            && msg_offset.saturating_add(msg_size) <= data.len(),
        VaultError::BadSignature
    );

    let pk_bytes = &data[pk_offset..pk_offset + 32];
    let sig_bytes = &data[sig_offset..sig_offset + 64];
    let msg_bytes = &data[msg_offset..msg_offset + msg_size];

    require!(
        pk_bytes == expected_oracle_pubkey && sig_bytes == expected_signature,
        VaultError::BadSignature
    );

    if msg_bytes != expected_payload {
        if let Ok(msg_str) = core::str::from_utf8(msg_bytes) {
            let parts: Vec<&str> = msg_str.split("||").collect();
            if parts.len() == 10 && parts[0] == ATTESTATION_DOMAIN {
                let epoch_str = expected_cohort_epoch.to_string();
                if parts[3] != expected_cohort_id || parts[4] != epoch_str {
                    return err!(VaultError::WrongCohort);
                }
                let user_str = expected_user.to_string();
                if parts[5] != user_str {
                    return err!(VaultError::WrongUser);
                }
            }
        }
        return err!(VaultError::BadSignature);
    }

    Ok(())
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
    pub claimed_count: u8,
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

#[derive(Accounts)]
pub struct CompleteMilestone<'info> {
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
    /// CHECK: Address constrained to the Instructions sysvar; parsed via load_instruction_at_checked
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SettleUser<'info> {
    /// Permissionless keeper; receives the settle bounty.
    #[account(mut)]
    pub caller: Signer<'info>,
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
        mut,
        seeds = [b"participant", cohort.key().as_ref(), participant.user.as_ref()],
        bump = participant.bump,
        constraint = participant.cohort == cohort.key() @ VaultError::WrongCohort,
    )]
    pub participant: Account<'info, Participant>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Finalize<'info> {
    pub caller: Signer<'info>,
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
    #[account(mut, address = cohort.treasury @ VaultError::WrongCohort)]
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
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
        mut,
        seeds = [b"participant", cohort.key().as_ref(), user.key().as_ref()],
        bump = participant.bump,
        constraint = participant.user == user.key() @ VaultError::WrongUser,
    )]
    pub participant: Account<'info, Participant>,
    /// Receives any per-claim rounding residual on the final claim.
    #[account(mut, address = cohort.treasury @ VaultError::WrongCohort)]
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
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
