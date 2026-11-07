# PagePledge — The Idea Explained in Plain English

Imagine you and a group of friends decide to read a book, study a course, or learn a particular subject together. Everyone agrees to complete certain tasks within a specific period.

The problem is that people often start with enthusiasm but lose motivation along the way. They procrastinate, miss deadlines, and abandon their goals because there is no real consequence for not following through.

PagePledge is designed to solve that problem by combining AI, financial commitment, and blockchain technology to help people stay accountable and complete their learning goals.

In simple terms, PagePledge allows people to put money behind their commitments, prove that they are making progress, and earn financial rewards for staying consistent.

## 1. How the idea works

Let's say five people want to read a book together over four weeks.

They create a reading cohort on PagePledge. A cohort is simply a group of people working toward the same goal.

They agree on:

- The book they want to read.
- How many chapters they must complete each week.
- How much money each person must commit.
- The deadline for each milestone.
- What percentage of their money can be forfeited if they fail to complete a milestone.

For example, each person commits 20 **SOL**. If there are five participants, the cohort starts with a total commitment of **100** **SOL**.

Everyone deposits their money into a smart contract on Solana. A smart contract is a program on the blockchain that automatically enforces the rules everyone agreed to.

This means nobody needs to trust the group organizer to hold or distribute the money. The funds are managed according to rules encoded in the program.

## 2. Where AI comes in

This is one of the most important parts of PagePledge.

We don't just want people to click a button saying they have completed a chapter. We want some way to check whether they actually engaged with the material.

This is where AI becomes useful.

When a participant reaches a reading milestone, the AI generates questions based on the material they were supposed to study.

For example, if the assignment was to read chapters 1–3 of a book, the AI can generate comprehension questions about those chapters.

The participant answers the questions, and the AI evaluates the answers using a defined grading rubric.

If the answers meet the required standard, the AI produces a digitally signed completion attestation.

That attestation is sent to the Solana program, which verifies that it came from an authorized evaluator and records the participant's completion.

An important distinction: AI grading is not mathematical proof that someone learned something. It is an evaluation performed by a trusted AI service. The blockchain verifies the evaluator's authorization and enforces the financial consequences.

## 3. What happens when someone succeeds or fails?

This is where the financial commitment becomes meaningful.

Participants who complete their milestones keep their eligible deposits and may receive a share of the money forfeited by participants who fail, according to the cohort's agreed rules.

Participants who miss milestones lose a predefined portion of their committed funds.

For example, imagine five people each commit 20 **SOL**:

- Four participants complete their milestones.
- One participant repeatedly misses the required milestones.
- The smart contract calculates the amount that participant forfeits.
- The forfeited funds are added to the cohort's reward pool.
- Participants who successfully finish can claim their allocated rewards.

The purpose is not to make money from people failing. The purpose is to create a meaningful financial incentive to follow through on commitments.

The rules, including the forfeiture percentage and reward distribution formula, are agreed upon before the cohort begins. They cannot simply be changed by the organizer halfway through.

## 4. Why Solana and smart contracts?

We use Solana because PagePledge needs a blockchain that can handle frequent, relatively small transactions efficiently.

The smart contract is responsible for the financial side of the platform.

It handles:

- Creating cohorts and storing their rules.
- Receiving participants' **SOL** deposits.
- Recording milestone completion.
- Verifying authorized AI attestations.
- Determining when participants have missed deadlines.
- Calculating forfeitures and rewards.
- Allowing participants to claim their funds.

The smart contract is the final authority over money.

Neither the AI nor the person who created the cohort can independently decide to take someone's money or distribute it to someone else.

We also want the system to support permissionless settlement. This means anyone can trigger the smart contract to settle an eligible participant after the deadline and grace period have passed. A keeper service can automate this process, but it does not have special authority over the funds.

## 5. What happens to the deposited money while people are participating?

This is where the DeFi component comes in.

Instead of leaving all deposited **SOL** idle, we want PagePledge to have the option of deploying cohort funds into established Solana lending protocols such as Kamino, Marginfi, Jup Lend, Solend or any other Yield Lending to generate yield.

In simple terms, the money could earn additional returns while participants are working toward their goals.

However, this is optional. The core protocol must work even if no yield is generated.

For the first version, we want to prioritize a reliable **SOL** vault and working deposit, settlement, and withdrawal mechanisms. Lending integration will be added only after we verify that the actual integration works safely.

We also need to ensure that participants can claim their funds without depending on a lending protocol being available at that exact moment.

## 6. What makes PagePledge different?

There are already many productivity apps, reading trackers, study groups, and habit trackers.

Most of them rely on reminders and notifications to keep people motivated.

PagePledge takes a different approach.

It combines three things:

AI accountability: AI generates questions and evaluates whether participants understand the material they were assigned.

Financial commitment: Participants put real money behind their goals, creating an incentive to stay consistent.

Blockchain enforcement: Solana smart contracts enforce the agreed rules transparently, rather than relying on an organizer to manage everyone's money.

The combination is what makes the idea interesting.

We are turning personal learning commitments into programmable financial agreements.

## 7. What would using PagePledge actually look like?

Here is a simple example from beginning to end.

## Create a cohort

A user creates a cohort called _30-Day Python Learning Challenge._ ## Set the rules

The creator defines the learning milestones, deadlines, required deposits, and forfeiture rules. ## Invite participants

Other users join the cohort, connect their Solana wallets, and deposit **SOL**. ## Complete learning milestones

Participants study their assigned materials and submit answers to AI-generated comprehension questions. ## AI evaluates progress

The AI grades the answers and signs successful completion results. ## The blockchain records progress

The smart contract verifies the attestation and updates the participant's progress. ## Missed milestones are settled

After the deadline and the allowed grace period, the smart contract can determine who failed to complete a milestone and apply the agreed forfeiture. ## Participants claim rewards

At the end of the cohort, successful participants can claim their remaining eligible deposits and their share of the reward pool.

## 8. What we are actually building for the hackathon

We don't need to build every possible feature immediately. The first version should prove that the central idea works.

Our **MVP** should include:

- A web application where users can create and join cohorts.
- A Solana Anchor smart contract that manages cohort funds and rules.
- **SOL** deposits into cohort-specific vaults.
- An AI service that generates comprehension questions and grades answers.
- An oracle service that signs successful completion attestations.
- On-chain milestone tracking and deterministic failure settlement.
- A keeper that automatically monitors deadlines and triggers settlement.
- A dashboard where users can see their progress, deposits, forfeitures, and rewards.

Features such as advanced AI agents, reputation tokens, global liquidity pools, and multiple lending integrations can come later.

## 9. The simplest way to explain PagePledge to someone

If your teammate asks, _What exactly are we building?_, you can explain it like this:

We are building PagePledge, an AI-powered accountability and financial commitment platform on Solana.

The idea is simple: people often struggle to complete learning goals because there are no meaningful consequences for procrastinating or giving up. PagePledge addresses this by allowing people to create or join learning groups, commit **SOL** toward their goals, and earn rewards for staying consistent.

For example, a group of people can create a 30-day reading challenge. Everyone deposits an agreed amount of **SOL** into a smart contract and commits to completing specific reading milestones.

At each milestone, our AI generates questions based on the assigned material and evaluates participants' answers. If someone passes, an authorized oracle signs their completion result, and the Solana smart contract records their progress.

If someone misses a milestone, the smart contract applies the forfeiture rules everyone agreed to when joining. The forfeited funds go into the cohort's reward pool and are distributed to eligible successful participants according to the protocol's rules.

Solana handles the money, participant records, deadlines, and reward distribution. AI handles question generation and comprehension evaluation. A keeper monitors deadlines and triggers settlements automatically.

We also plan to make yield generation possible through Solana DeFi lending protocols, although that will be an optional feature rather than something the core protocol depends on.

Ultimately, PagePledge turns learning goals into financial commitments. It combines AI-powered accountability, real financial incentives, and transparent blockchain enforcement to help people follow through on what they promise themselves and others.

My one-sentence description: PagePledge is a Solana-based platform where people stake money on their learning goals, AI evaluates their progress, and smart contracts reward consistency while enforcing agreed consequences for missed commitments.

That's the idea your teammate needs to understand before discussing the technical implementation.
