#[cfg(test)]
mod tests {
    use crate::ID as PROGRAM_ID;
    use anchor_lang::system_program;
    use litesvm::LiteSVM;
    use solana_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    };

    const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

    fn get_vault_pda(signer: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vault", signer.as_ref()], &PROGRAM_ID)
    }

    fn create_deposit_ix(signer: &Pubkey, vault: &Pubkey, amount: u64) -> Instruction {
        // Anchor discriminator for "deposit" = hash("global:deposit")[0..8]
        let discriminator: [u8; 8] = [242, 35, 198, 137, 82, 225, 242, 182];
        let mut data = discriminator.to_vec();
        data.extend_from_slice(&amount.to_le_bytes());

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*signer, true),
                AccountMeta::new(*vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        }
    }

    fn create_withdraw_ix(signer: &Pubkey, vault: &Pubkey) -> Instruction {
        // Anchor discriminator for "withdraw" = hash("global:withdraw")[0..8]
        let discriminator: [u8; 8] = [183, 18, 70, 156, 148, 109, 161, 34];

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*signer, true),
                AccountMeta::new(*vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: discriminator.to_vec(),
        }
    }

    #[test]
    fn test_deposit_and_withdraw() {
        let mut svm = LiteSVM::new();

        // Load the program
        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        svm.add_program(PROGRAM_ID, program_bytes).unwrap();

        // Create a user with some SOL
        let user = Keypair::new();
        svm.airdrop(&user.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        // Get vault PDA
        let (vault_pda, _bump) = get_vault_pda(&user.pubkey());

        // Deposit 1 SOL
        let deposit_amount = LAMPORTS_PER_SOL;
        let deposit_ix = create_deposit_ix(&user.pubkey(), &vault_pda, deposit_amount);

        let blockhash = svm.latest_blockhash();
        let deposit_tx = Transaction::new_signed_with_payer(
            &[deposit_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(deposit_tx);
        assert!(result.is_ok(), "Deposit should succeed");

        // Check vault balance
        let vault_account = svm.get_account(&vault_pda).unwrap();
        assert_eq!(vault_account.lamports, deposit_amount);

        // Withdraw
        let withdraw_ix = create_withdraw_ix(&user.pubkey(), &vault_pda);

        let blockhash = svm.latest_blockhash();
        let withdraw_tx = Transaction::new_signed_with_payer(
            &[withdraw_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(withdraw_tx);
        assert!(result.is_ok(), "Withdraw should succeed");

        // Check vault is empty (account may not exist or have 0 lamports)
        let vault_account = svm.get_account(&vault_pda);
        assert!(
            vault_account.is_none() || vault_account.unwrap().lamports == 0,
            "Vault should be empty after withdraw"
        );
    }

    fn ix_discriminator(name: &str) -> [u8; 8] {
        use solana_sdk::hash::hash;
        let preimage = format!("global:{}", name);
        let h = hash(preimage.as_bytes());
        let mut disc = [0u8; 8];
        disc.copy_from_slice(&h.to_bytes()[0..8]);
        disc
    }

    fn get_cohort_pda(creator: &Pubkey, id: &str) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"cohort", creator.as_ref(), id.as_bytes()], &PROGRAM_ID)
    }

    fn get_cohort_vault_pda(cohort: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vault", cohort.as_ref()], &PROGRAM_ID)
    }

    fn encode_string(out: &mut Vec<u8>, s: &str) {
        out.extend_from_slice(&(s.len() as u32).to_le_bytes());
        out.extend_from_slice(s.as_bytes());
    }

    #[allow(clippy::too_many_arguments)]
    fn create_cohort_ix(
        creator: &Pubkey,
        id: &str,
        title: &str,
        stake: u64,
        milestone_count: u8,
        max_participants: u8,
        interval_seconds: i64,
        grace_period_seconds: i64,
        content_hash: [u8; 32],
        oracle_pubkey: [u8; 32],
        treasury: Pubkey,
    ) -> (Instruction, Pubkey, Pubkey) {
        let (cohort_pda, _) = get_cohort_pda(creator, id);
        let (vault_pda, _) = get_cohort_vault_pda(&cohort_pda);

        let mut data = ix_discriminator("create_cohort").to_vec();
        encode_string(&mut data, id);
        encode_string(&mut data, title);
        data.extend_from_slice(&stake.to_le_bytes());
        data.push(milestone_count);
        data.push(max_participants);
        data.extend_from_slice(&interval_seconds.to_le_bytes());
        data.extend_from_slice(&grace_period_seconds.to_le_bytes());
        data.extend_from_slice(&content_hash);
        data.extend_from_slice(&oracle_pubkey);
        data.extend_from_slice(treasury.as_ref());

        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*creator, true),
                AccountMeta::new(cohort_pda, false),
                AccountMeta::new(vault_pda, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        };
        (ix, cohort_pda, vault_pda)
    }

    #[test]
    fn test_create_cohort_initializes_pda_and_funds_vault_rent_reserve() {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        svm.add_program(PROGRAM_ID, program_bytes).unwrap();

        let creator = Keypair::new();
        let treasury = Keypair::new();
        svm.airdrop(&creator.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let (ix, cohort_pda, vault_pda) = create_cohort_ix(
            &creator.pubkey(),
            "rust-101",
            "Rust Ownership 101",
            500_000_000, // 0.5 SOL
            3,
            10,
            86_400,
            3_600,
            [0xAA; 32],
            [0xBB; 32],
            treasury.pubkey(),
        );

        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        );

        let res = svm.send_transaction(tx);
        assert!(res.is_ok(), "create_cohort should succeed: {:?}", res.err());

        let cohort_acc = svm.get_account(&cohort_pda).expect("Cohort PDA must exist");
        assert_eq!(cohort_acc.owner, PROGRAM_ID);

        let vault_acc = svm.get_account(&vault_pda).expect("Vault PDA must exist");
        let rent_min = svm.minimum_balance_for_rent_exemption(0);
        assert_eq!(vault_acc.lamports, rent_min, "Vault PDA must hold exact 0-byte rent reserve");

        use anchor_lang::AccountDeserialize;
        let mut cohort_data: &[u8] = &cohort_acc.data;
        let decoded = crate::Cohort::try_deserialize(&mut cohort_data).expect("deserialize Cohort");
        assert_eq!(decoded.id, "rust-101");
        assert_eq!(decoded.title, "Rust Ownership 101");
        assert_eq!(decoded.creator, creator.pubkey());
        assert_eq!(decoded.stake, 500_000_000);
        assert_eq!(decoded.milestone_count, 3);
        assert_eq!(decoded.max_participants, 10);
        assert_eq!(decoded.interval_seconds, 86_400);
        assert_eq!(decoded.grace_period_seconds, 3_600);
        assert_eq!(decoded.content_hash, [0xAA; 32]);
        assert_eq!(decoded.oracle_pubkey, [0xBB; 32]);
        assert_eq!(decoded.treasury, treasury.pubkey());
        assert_eq!(decoded.vault_rent_reserve, rent_min);
        assert_eq!(decoded.status, crate::STATUS_OPEN);
        assert_eq!(decoded.participant_count, 0);
        assert_eq!(decoded.total_deposits, 0);
    }

    #[test]
    fn test_create_cohort_rejects_out_of_bounds_params() {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        svm.add_program(PROGRAM_ID, program_bytes).unwrap();

        let creator = Keypair::new();
        let treasury = Keypair::new();
        svm.airdrop(&creator.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        // 1. milestone_count < 2
        let (ix_low_m, _, _) = create_cohort_ix(
            &creator.pubkey(),
            "bad-m-low",
            "Bad M",
            500_000_000,
            1,
            10,
            86_400,
            3_600,
            [0; 32],
            [0; 32],
            treasury.pubkey(),
        );
        let tx1 = Transaction::new_signed_with_payer(
            &[ix_low_m],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        );
        assert!(svm.send_transaction(tx1).is_err(), "milestone_count=1 must fail");

        // 2. milestone_count > 10
        let (ix_high_m, _, _) = create_cohort_ix(
            &creator.pubkey(),
            "bad-m-high",
            "Bad M High",
            500_000_000,
            11,
            10,
            86_400,
            3_600,
            [0; 32],
            [0; 32],
            treasury.pubkey(),
        );
        let tx2 = Transaction::new_signed_with_payer(
            &[ix_high_m],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        );
        assert!(svm.send_transaction(tx2).is_err(), "milestone_count=11 must fail");

        // 3. max_participants < 2
        let (ix_low_p, _, _) = create_cohort_ix(
            &creator.pubkey(),
            "bad-p-low",
            "Bad P Low",
            500_000_000,
            3,
            1,
            86_400,
            3_600,
            [0; 32],
            [0; 32],
            treasury.pubkey(),
        );
        let tx3 = Transaction::new_signed_with_payer(
            &[ix_low_p],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        );
        assert!(svm.send_transaction(tx3).is_err(), "max_participants=1 must fail");

        // 4. max_participants > 50
        let (ix_high_p, _, _) = create_cohort_ix(
            &creator.pubkey(),
            "bad-p-high",
            "Bad P High",
            500_000_000,
            3,
            51,
            86_400,
            3_600,
            [0; 32],
            [0; 32],
            treasury.pubkey(),
        );
        let tx4 = Transaction::new_signed_with_payer(
            &[ix_high_p],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        );
        assert!(svm.send_transaction(tx4).is_err(), "max_participants=51 must fail");

        // 5. stake == 0
        let (ix_zero_s, _, _) = create_cohort_ix(
            &creator.pubkey(),
            "bad-stake",
            "Bad Stake",
            0,
            3,
            10,
            86_400,
            3_600,
            [0; 32],
            [0; 32],
            treasury.pubkey(),
        );
        let tx5 = Transaction::new_signed_with_payer(
            &[ix_zero_s],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        );
        assert!(svm.send_transaction(tx5).is_err(), "stake=0 must fail");
    }

    fn get_participant_pda(cohort: &Pubkey, user: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"participant", cohort.as_ref(), user.as_ref()], &PROGRAM_ID)
    }

    fn create_join_ix(user: &Pubkey, cohort: &Pubkey) -> (Instruction, Pubkey, Pubkey) {
        let (participant_pda, _) = get_participant_pda(cohort, user);
        let (vault_pda, _) = get_cohort_vault_pda(cohort);

        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*user, true),
                AccountMeta::new(*cohort, false),
                AccountMeta::new(vault_pda, false),
                AccountMeta::new(participant_pda, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: ix_discriminator("join").to_vec(),
        };
        (ix, participant_pda, vault_pda)
    }

    fn assert_custom_error(
        res: &Result<litesvm::types::TransactionMetadata, litesvm::types::FailedTransactionMetadata>,
        expected: crate::VaultError,
    ) {
        let err = res.as_ref().expect_err("Expected transaction to fail");
        let expected_code: u32 = expected.into();
        match err.err {
            solana_sdk::transaction::TransactionError::InstructionError(
                _,
                solana_sdk::instruction::InstructionError::Custom(code),
            ) => {
                assert_eq!(
                    code, expected_code,
                    "Expected error {:?} ({}), got Custom({}) with logs: {:?}",
                    expected, expected_code, code, err.meta.logs
                );
            }
            ref other => panic!(
                "Expected Custom({}), got {:?} with logs: {:?}",
                expected_code, other, err.meta.logs
            ),
        }
    }

    #[test]
    fn test_join_transfers_stake_and_rejects_duplicate_or_full_cohort() {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        svm.add_program(PROGRAM_ID, program_bytes).unwrap();

        let creator = Keypair::new();
        let treasury = Keypair::new();
        let alice = Keypair::new();
        let bob = Keypair::new();
        let carol = Keypair::new();

        for kp in [&creator, &alice, &bob, &carol] {
            svm.airdrop(&kp.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
        }

        let stake = 500_000_000u64; // 0.5 SOL
        let (create_ix, cohort_pda, vault_pda) = create_cohort_ix(
            &creator.pubkey(),
            "cap-2-cohort",
            "Small Cohort",
            stake,
            3,
            2, // max_participants = 2
            86_400,
            3_600,
            [0x11; 32],
            [0x22; 32],
            treasury.pubkey(),
        );
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[create_ix],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        ))
        .unwrap();

        let rent_min = svm.minimum_balance_for_rent_exemption(0);

        // Alice joins
        let (join_alice, alice_part_pda, _) = create_join_ix(&alice.pubkey(), &cohort_pda);
        let res_alice = svm.send_transaction(Transaction::new_signed_with_payer(
            &[join_alice],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ));
        assert!(res_alice.is_ok(), "Alice join should succeed: {:?}", res_alice.err());

        // Verify Alice Participant PDA
        use anchor_lang::AccountDeserialize;
        let alice_part_acc = svm.get_account(&alice_part_pda).expect("Alice Participant PDA");
        let mut slice: &[u8] = &alice_part_acc.data;
        let alice_part = crate::Participant::try_deserialize(&mut slice).unwrap();
        assert_eq!(alice_part.cohort, cohort_pda);
        assert_eq!(alice_part.user, alice.pubkey());
        assert_eq!(alice_part.stake, stake);
        assert_eq!(alice_part.completed_bitmap, 0);

        // Duplicate join by Alice must fail with AlreadyJoined
        svm.expire_blockhash();
        let (dup_alice, _, _) = create_join_ix(&alice.pubkey(), &cohort_pda);
        let res_dup = svm.send_transaction(Transaction::new_signed_with_payer(
            &[dup_alice],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ));
        assert_custom_error(&res_dup, crate::VaultError::AlreadyJoined);

        // Bob joins (reaches max_participants = 2)
        let (join_bob, _, _) = create_join_ix(&bob.pubkey(), &cohort_pda);
        let res_bob = svm.send_transaction(Transaction::new_signed_with_payer(
            &[join_bob],
            Some(&bob.pubkey()),
            &[&bob],
            svm.latest_blockhash(),
        ));
        assert!(res_bob.is_ok(), "Bob join should succeed: {:?}", res_bob.err());

        // Check vault invariant: vault.lamports() - vault_rent_reserve == total_deposits
        let vault_acc = svm.get_account(&vault_pda).unwrap();
        let cohort_acc = svm.get_account(&cohort_pda).unwrap();
        let mut c_slice: &[u8] = &cohort_acc.data;
        let cohort_state = crate::Cohort::try_deserialize(&mut c_slice).unwrap();
        assert_eq!(cohort_state.participant_count, 2);
        assert_eq!(cohort_state.total_deposits, stake * 2);
        assert_eq!(cohort_state.vault_rent_reserve, rent_min);
        assert_eq!(
            vault_acc.lamports - cohort_state.vault_rent_reserve,
            cohort_state.total_deposits
        );

        // Carol attempts to join full cohort -> CohortFull
        let (join_carol, _, _) = create_join_ix(&carol.pubkey(), &cohort_pda);
        let res_carol = svm.send_transaction(Transaction::new_signed_with_payer(
            &[join_carol],
            Some(&carol.pubkey()),
            &[&carol],
            svm.latest_blockhash(),
        ));
        assert_custom_error(&res_carol, crate::VaultError::CohortFull);
    }

    fn create_start_cohort_ix(caller: &Pubkey, cohort: &Pubkey) -> Instruction {
        let (participant_pda, _) = get_participant_pda(cohort, caller);
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*caller, true),
                AccountMeta::new(*cohort, false),
                AccountMeta::new_readonly(participant_pda, false),
            ],
            data: ix_discriminator("start_cohort").to_vec(),
        }
    }

    #[test]
    fn test_start_cohort_by_creator_or_participant_and_rejections() {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        svm.add_program(PROGRAM_ID, program_bytes).unwrap();

        let creator = Keypair::new();
        let treasury = Keypair::new();
        let alice = Keypair::new();
        let bob = Keypair::new();
        let carol = Keypair::new();
        let outsider = Keypair::new();

        for kp in [&creator, &alice, &bob, &carol, &outsider] {
            svm.airdrop(&kp.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
        }

        let stake = 500_000_000u64;
        let interval = 86_400i64;
        let (create_ix, cohort_pda, _) = create_cohort_ix(
            &creator.pubkey(),
            "start-test-1",
            "Start Test Cohort",
            stake,
            3,
            10,
            interval,
            3_600,
            [0x33; 32],
            [0x44; 32],
            treasury.pubkey(),
        );
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[create_ix],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        ))
        .unwrap();

        // 1. Alice joins (only 1 participant so far)
        let (join_alice, _, _) = create_join_ix(&alice.pubkey(), &cohort_pda);
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[join_alice],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ))
        .unwrap();

        // 2. Starting with < 2 participants must fail with MinParticipantsNotMet
        let start_early = create_start_cohort_ix(&creator.pubkey(), &cohort_pda);
        let res_early = svm.send_transaction(Transaction::new_signed_with_payer(
            &[start_early],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        ));
        assert_custom_error(&res_early, crate::VaultError::MinParticipantsNotMet);

        // 3. Bob joins (now 2 participants)
        let (join_bob, _, _) = create_join_ix(&bob.pubkey(), &cohort_pda);
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[join_bob],
            Some(&bob.pubkey()),
            &[&bob],
            svm.latest_blockhash(),
        ))
        .unwrap();

        // 4. Outsider (neither creator nor joined participant) cannot start cohort -> WrongUser
        let start_outsider = create_start_cohort_ix(&outsider.pubkey(), &cohort_pda);
        let res_outsider = svm.send_transaction(Transaction::new_signed_with_payer(
            &[start_outsider],
            Some(&outsider.pubkey()),
            &[&outsider],
            svm.latest_blockhash(),
        ));
        assert_custom_error(&res_outsider, crate::VaultError::WrongUser);

        // 5. Advance Clock to 1_800_000_000 and let joined participant Alice start the cohort
        let mut clock = svm.get_sysvar::<solana_sdk::clock::Clock>();
        clock.unix_timestamp = 1_800_000_000;
        svm.set_sysvar::<solana_sdk::clock::Clock>(&clock);

        let start_by_alice = create_start_cohort_ix(&alice.pubkey(), &cohort_pda);
        let res_start = svm.send_transaction(Transaction::new_signed_with_payer(
            &[start_by_alice],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ));
        assert!(res_start.is_ok(), "Participant should be able to start cohort: {:?}", res_start.err());

        use anchor_lang::AccountDeserialize;
        let cohort_acc = svm.get_account(&cohort_pda).unwrap();
        let mut slice: &[u8] = &cohort_acc.data;
        let cohort_state = crate::Cohort::try_deserialize(&mut slice).unwrap();
        assert_eq!(cohort_state.status, crate::STATUS_ACTIVE);
        assert_eq!(cohort_state.started_at, 1_800_000_000);
        assert_eq!(cohort_state.deadlines[0], 1_800_000_000 + interval);
        assert_eq!(cohort_state.deadlines[1], 1_800_000_000 + interval * 2);
        assert_eq!(cohort_state.deadlines[2], 1_800_000_000 + interval * 3);

        // 6. Second start_cohort call on Active cohort must fail with CohortNotOpen
        svm.expire_blockhash();
        let start_again = create_start_cohort_ix(&creator.pubkey(), &cohort_pda);
        let res_again = svm.send_transaction(Transaction::new_signed_with_payer(
            &[start_again],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        ));
        assert_custom_error(&res_again, crate::VaultError::CohortNotOpen);

        // 7. Joining an Active cohort must fail with CohortNotOpen
        let (join_carol, _, _) = create_join_ix(&carol.pubkey(), &cohort_pda);
        let res_carol = svm.send_transaction(Transaction::new_signed_with_payer(
            &[join_carol],
            Some(&carol.pubkey()),
            &[&carol],
            svm.latest_blockhash(),
        ));
        assert_custom_error(&res_carol, crate::VaultError::CohortNotOpen);

        // 8. Also verify creator can start a fresh cohort once >= 2 joined
        let (create_ix2, cohort_pda2, _) = create_cohort_ix(
            &creator.pubkey(),
            "start-test-2",
            "Creator Start Cohort",
            stake,
            2,
            10,
            interval,
            3_600,
            [0x33; 32],
            [0x44; 32],
            treasury.pubkey(),
        );
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[create_ix2],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        ))
        .unwrap();
        for kp in [&alice, &bob] {
            let (j_ix, _, _) = create_join_ix(&kp.pubkey(), &cohort_pda2);
            svm.send_transaction(Transaction::new_signed_with_payer(
                &[j_ix],
                Some(&kp.pubkey()),
                &[kp],
                svm.latest_blockhash(),
            ))
            .unwrap();
        }
        let start_by_creator = create_start_cohort_ix(&creator.pubkey(), &cohort_pda2);
        let res_creator = svm.send_transaction(Transaction::new_signed_with_payer(
            &[start_by_creator],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        ));
        assert!(res_creator.is_ok(), "Creator start_cohort should succeed: {:?}", res_creator.err());
    }

    fn create_commit_submission_ix(
        user: &Pubkey,
        cohort: &Pubkey,
        milestone_idx: u8,
        answer_hash: [u8; 32],
    ) -> (Instruction, Pubkey) {
        let (participant_pda, _) = get_participant_pda(cohort, user);
        let mut data = ix_discriminator("commit_submission").to_vec();
        data.push(milestone_idx);
        data.extend_from_slice(&answer_hash);

        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*user, true),
                AccountMeta::new(*cohort, false),
                AccountMeta::new(participant_pda, false),
            ],
            data,
        };
        (ix, participant_pda)
    }

    #[test]
    fn test_commit_submission_auto_starts_enforces_3_attempts_deadline_and_completed_bitmap() {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        svm.add_program(PROGRAM_ID, program_bytes).unwrap();

        let creator = Keypair::new();
        let treasury = Keypair::new();
        let alice = Keypair::new();
        let bob = Keypair::new();

        for kp in [&creator, &alice, &bob] {
            svm.airdrop(&kp.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
        }

        let stake = 500_000_000u64;
        let interval = 86_400i64;
        let (create_ix, cohort_pda, _) = create_cohort_ix(
            &creator.pubkey(),
            "commit-test-1",
            "Commit Test Cohort",
            stake,
            3,
            10,
            interval,
            3_600,
            [0x55; 32],
            [0x66; 32],
            treasury.pubkey(),
        );
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[create_ix],
            Some(&creator.pubkey()),
            &[&creator],
            svm.latest_blockhash(),
        ))
        .unwrap();

        // Alice joins (only 1 participant so far)
        let (join_alice, alice_part_pda, _) = create_join_ix(&alice.pubkey(), &cohort_pda);
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[join_alice],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ))
        .unwrap();

        // 1. Commit while Open with < 2 participants must fail with CohortNotOpen
        let (commit_too_early, _) =
            create_commit_submission_ix(&alice.pubkey(), &cohort_pda, 0, [0x01; 32]);
        let res_too_early = svm.send_transaction(Transaction::new_signed_with_payer(
            &[commit_too_early],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ));
        assert_custom_error(&res_too_early, crate::VaultError::CohortNotOpen);

        // Bob joins (now 2 participants, still Open)
        let (join_bob, _, _) = create_join_ix(&bob.pubkey(), &cohort_pda);
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[join_bob],
            Some(&bob.pubkey()),
            &[&bob],
            svm.latest_blockhash(),
        ))
        .unwrap();

        // Set clock to 1_900_000_000
        let mut clock = svm.get_sysvar::<solana_sdk::clock::Clock>();
        clock.unix_timestamp = 1_900_000_000;
        svm.set_sysvar::<solana_sdk::clock::Clock>(&clock);

        // 2. Alice commits attempt #1 while cohort is Open with >= 2 participants -> auto-starts cohort!
        let (commit_1, _) =
            create_commit_submission_ix(&alice.pubkey(), &cohort_pda, 0, [0xA1; 32]);
        let res_1 = svm.send_transaction(Transaction::new_signed_with_payer(
            &[commit_1],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ));
        assert!(res_1.is_ok(), "Commit 1 should auto-start and succeed: {:?}", res_1.err());

        use anchor_lang::AccountDeserialize;
        let cohort_acc = svm.get_account(&cohort_pda).unwrap();
        let mut c_slice: &[u8] = &cohort_acc.data;
        let cohort_state = crate::Cohort::try_deserialize(&mut c_slice).unwrap();
        assert_eq!(cohort_state.status, crate::STATUS_ACTIVE);
        assert_eq!(cohort_state.started_at, 1_900_000_000);
        assert_eq!(cohort_state.deadlines[0], 1_900_000_000 + interval);

        let part_acc = svm.get_account(&alice_part_pda).unwrap();
        let mut p_slice: &[u8] = &part_acc.data;
        let part_state = crate::Participant::try_deserialize(&mut p_slice).unwrap();
        assert_eq!(part_state.attempt_counts[0], 1);
        assert_eq!(part_state.commit_timestamps[0], 1_900_000_000);
        assert_eq!(part_state.answer_hashes[0], [0xA1; 32]);

        // 3. Alice commits attempt #2 and attempt #3 before deadline[0]
        clock.unix_timestamp = 1_900_000_100;
        svm.set_sysvar::<solana_sdk::clock::Clock>(&clock);
        let (commit_2, _) =
            create_commit_submission_ix(&alice.pubkey(), &cohort_pda, 0, [0xA2; 32]);
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[commit_2],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ))
        .unwrap();

        clock.unix_timestamp = 1_900_000_200;
        svm.set_sysvar::<solana_sdk::clock::Clock>(&clock);
        let (commit_3, _) =
            create_commit_submission_ix(&alice.pubkey(), &cohort_pda, 0, [0xA3; 32]);
        svm.send_transaction(Transaction::new_signed_with_payer(
            &[commit_3],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ))
        .unwrap();

        let part_acc = svm.get_account(&alice_part_pda).unwrap();
        let mut p_slice: &[u8] = &part_acc.data;
        let part_state = crate::Participant::try_deserialize(&mut p_slice).unwrap();
        assert_eq!(part_state.attempt_counts[0], 3);
        assert_eq!(part_state.commit_timestamps[0], 1_900_000_200);
        assert_eq!(part_state.answer_hashes[0], [0xA3; 32]);

        // 4. 4th attempt on milestone 0 must fail with MaxAttemptsExceeded
        let (commit_4, _) =
            create_commit_submission_ix(&alice.pubkey(), &cohort_pda, 0, [0xA4; 32]);
        let res_4 = svm.send_transaction(Transaction::new_signed_with_payer(
            &[commit_4],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ));
        assert_custom_error(&res_4, crate::VaultError::MaxAttemptsExceeded);

        // 5. Out-of-bounds milestone_idx (>= milestone_count) must fail with SubmissionWindowClosed
        let (commit_oob, _) =
            create_commit_submission_ix(&alice.pubkey(), &cohort_pda, 3, [0xBB; 32]);
        let res_oob = svm.send_transaction(Transaction::new_signed_with_payer(
            &[commit_oob],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ));
        assert_custom_error(&res_oob, crate::VaultError::SubmissionWindowClosed);

        // 6. Advance clock past deadline[0] -> Bob's late commit for milestone 0 must fail with SubmissionWindowClosed
        clock.unix_timestamp = 1_900_000_000 + interval + 1;
        svm.set_sysvar::<solana_sdk::clock::Clock>(&clock);
        let (commit_late, _) =
            create_commit_submission_ix(&bob.pubkey(), &cohort_pda, 0, [0xB1; 32]);
        let res_late = svm.send_transaction(Transaction::new_signed_with_payer(
            &[commit_late],
            Some(&bob.pubkey()),
            &[&bob],
            svm.latest_blockhash(),
        ));
        assert_custom_error(&res_late, crate::VaultError::SubmissionWindowClosed);

        // 7. If milestone 1 bit is already set in completed_bitmap, commit_submission must fail with AlreadyCompleted
        let mut alice_acc_mut = svm.get_account(&alice_part_pda).unwrap();
        let mut p_slice: &[u8] = &alice_acc_mut.data;
        let mut alice_state_mut = crate::Participant::try_deserialize(&mut p_slice).unwrap();
        alice_state_mut.completed_bitmap |= 1 << 1;
        let mut body_data = Vec::new();
        anchor_lang::AnchorSerialize::serialize(&alice_state_mut, &mut body_data).unwrap();
        alice_acc_mut.data[8..8 + body_data.len()].copy_from_slice(&body_data);
        svm.set_account(alice_part_pda, alice_acc_mut).unwrap();

        let (commit_done, _) =
            create_commit_submission_ix(&alice.pubkey(), &cohort_pda, 1, [0xC1; 32]);
        let res_done = svm.send_transaction(Transaction::new_signed_with_payer(
            &[commit_done],
            Some(&alice.pubkey()),
            &[&alice],
            svm.latest_blockhash(),
        ));
        assert_custom_error(&res_done, crate::VaultError::AlreadyCompleted);
    }

    #[test]
    fn test_deposit_fails_if_vault_has_funds() {
        let mut svm = LiteSVM::new();

        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        svm.add_program(PROGRAM_ID, program_bytes).unwrap();

        let user = Keypair::new();
        svm.airdrop(&user.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let (vault_pda, _bump) = get_vault_pda(&user.pubkey());

        // First deposit
        let deposit_ix = create_deposit_ix(&user.pubkey(), &vault_pda, LAMPORTS_PER_SOL);
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[deposit_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );
        svm.send_transaction(tx).unwrap();

        // Second deposit should fail
        let deposit_ix2 = create_deposit_ix(&user.pubkey(), &vault_pda, LAMPORTS_PER_SOL);
        let blockhash = svm.latest_blockhash();
        let tx2 = Transaction::new_signed_with_payer(
            &[deposit_ix2],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(tx2);
        assert!(result.is_err(), "Second deposit should fail");
    }

    #[test]
    fn test_withdraw_fails_if_vault_empty() {
        let mut svm = LiteSVM::new();

        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        svm.add_program(PROGRAM_ID, program_bytes).unwrap();

        let user = Keypair::new();
        svm.airdrop(&user.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let (vault_pda, _bump) = get_vault_pda(&user.pubkey());

        // Try to withdraw from empty vault
        let withdraw_ix = create_withdraw_ix(&user.pubkey(), &vault_pda);
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[withdraw_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(tx);
        assert!(result.is_err(), "Withdraw from empty vault should fail");
    }
}
