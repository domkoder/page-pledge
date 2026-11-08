import { hashAnswerText } from "../chain/attestation";

export interface RubricCriterion {
  id: string;
  topic: string;
  description: string;
  weight: number; // sums to 100 across criteria
  keywords: string[]; // concept stems matched by the deterministic offline grader
}

export interface PracticeDrill {
  topic: string;
  question: string;
  hint: string;
  targetKeywords: string[];
}

export interface MilestoneMaterial {
  milestoneIdx: number;
  title: string;
  subtitle: string;
  passage: string;
  contentHash: string;
  questions: string[];
  rubricVersion: string;
  rubric: RubricCriterion[];
  exemplarAnswer: string;
  practiceDrills: Record<string, PracticeDrill>;
}

const RAW_PASSAGES: Omit<MilestoneMaterial, "contentHash">[] = [
  {
    milestoneIdx: 0,
    title: "Milestone 1: Stack vs. Heap & The Three Rules of Ownership",
    subtitle: "Deterministic memory reclamation without a garbage collector",
    passage: `In Rust, memory management is enforced at compile time through Ownership rather than a runtime garbage collector or manual malloc/free calls. Every value in a Rust program resides either on the stack—which requires a known, fixed size at compile time and pushes/pops frames in LIFO order—or on the heap, where dynamically sized data (such as a growable String buffer) is allocated and tracked via a stack-resident pointer, length, and capacity.

Ownership is governed by three strict invariants: (1) each value in Rust has a single owner variable; (2) there can only be one owner at any given moment; and (3) when the owner variable goes out of scope at the end of its lexical block, Rust automatically invokes the Drop trait implementation to deallocate the underlying heap memory deterministically (Resource Acquisition Is Initialization, or RAII).`,
    questions: [
      "Explain the three rules of ownership in Rust and how stack vs. heap allocation interacts with automatic Drop deallocation when a String goes out of scope.",
      "Why does a Rust String store metadata on the stack and bytes on the heap, and what happens deterministically when its owner exits scope?",
    ],
    rubricVersion: "rust-own-v1.0",
    rubric: [
      {
        id: "single-owner",
        topic: "Single Owner Invariant",
        description:
          "States that each value has a single owner and only one owner at a time.",
        weight: 35,
        keywords: ["owner", "single", "one owner", "variable", "ownership"],
      },
      {
        id: "stack-vs-heap",
        topic: "Stack vs. Heap Layout",
        description:
          "Contrasts fixed-size stack metadata (pointer/len/capacity) with heap buffer allocation.",
        weight: 30,
        keywords: [
          "stack",
          "heap",
          "pointer",
          "fixed",
          "dynamic",
          "buffer",
          "allocate",
        ],
      },
      {
        id: "scope-drop",
        topic: "Scope & Deterministic Drop (RAII)",
        description:
          "Explains that exiting scope triggers Drop to free heap memory without a GC.",
        weight: 35,
        keywords: [
          "scope",
          "drop",
          "deallocat",
          "free",
          "raii",
          "garbage",
          "deterministic",
        ],
      },
    ],
    exemplarAnswer:
      "Rust enforces that every value has a single owner variable and only one owner at a time. A String stores its fixed-size pointer, length, and capacity on the stack while allocating its growable text buffer on the heap. When the owner variable goes out of scope, Rust deterministically calls Drop (RAII) to free the heap allocation without needing a garbage collector.",
    practiceDrills: {
      "Single Owner Invariant": {
        topic: "Single Owner Invariant",
        question:
          "Why does Rust forbid two independent variables from owning the same heap buffer simultaneously?",
        hint: "Think about what would happen when both variables exit their scopes at the end of a block.",
        targetKeywords: ["owner", "one", "double", "free", "drop"],
      },
      "Stack vs. Heap Layout": {
        topic: "Stack vs. Heap Layout",
        question:
          "Which parts of a `String` live on the stack versus the heap, and why?",
        hint: "Consider what has a compile-time fixed size (24 bytes on 64-bit) vs. growable runtime text.",
        targetKeywords: [
          "stack",
          "heap",
          "pointer",
          "length",
          "capacity",
          "fixed",
        ],
      },
      "Scope & Deterministic Drop (RAII)": {
        topic: "Scope & Deterministic Drop (RAII)",
        question:
          "When exactly is `Drop::drop` executed for a heap-allocated value in Rust?",
        hint: "Look at the closing curly brace where the owning variable leaves scope.",
        targetKeywords: ["scope", "drop", "free", "deallocat", "raii"],
      },
    },
  },
  {
    milestoneIdx: 1,
    title: "Milestone 2: Move Semantics vs. Copy and Clone",
    subtitle:
      "Preventing double-free vulnerabilities through ownership transfer",
    passage: `When you assign a heap-owning variable to another variable in Rust—such as \`let s2 = s1;\` where \`s1\` is a \`String\`—Rust performs a Move rather than a shallow pointer copy. Although the 24-byte stack header (pointer, length, capacity) is copied, Rust immediately invalidates \`s1\` at compile time. If both \`s1\` and \`s2\` remained valid owners of the same heap buffer, exiting the block would drop both variables and cause a catastrophic double-free memory corruption bug.

Types stored entirely on the stack with no heap pointers—such as integers (\`i32\`), booleans, and fixed tuples of scalar types—implement the \`Copy\` marker trait, meaning assignment creates an independent bitwise copy and the source variable stays valid. For heap-allocated types that cannot implement \`Copy\`, developers must explicitly call \`.clone()\` to allocate a fresh heap buffer and deep-copy the underlying bytes.`,
    questions: [
      "Why does assigning `let s2 = s1` on a `String` invalidate `s1` (Move semantics), and how does this differ from types implementing `Copy` or calling `.clone()`?",
      "Contrast a Move with `Copy` and `.clone()` in Rust, explaining how invalidating the source variable prevents a double-free error.",
    ],
    rubricVersion: "rust-own-v1.0",
    rubric: [
      {
        id: "move-invalidation",
        topic: "Move Semantics & Source Invalidation",
        description:
          "Explains that moving transfers ownership and invalidates the original variable at compile time.",
        weight: 35,
        keywords: [
          "move",
          "invalidat",
          "transfer",
          "s1",
          "ownership",
          "compile",
        ],
      },
      {
        id: "double-free",
        topic: "Double-Free Prevention",
        description:
          "Identifies that invalidating the moved-from owner prevents freeing the same heap buffer twice.",
        weight: 30,
        keywords: [
          "double-free",
          "double free",
          "twice",
          "corrupt",
          "same heap",
          "drop both",
        ],
      },
      {
        id: "copy-vs-clone",
        topic: "Copy Trait vs. Explicit Clone",
        description:
          "Distinguishes stack-only bitwise Copy types from explicit deep heap allocation via .clone().",
        weight: 35,
        keywords: [
          "copy",
          "clone",
          "deep",
          "stack",
          "bitwise",
          "scalar",
          "explicit",
        ],
      },
    ],
    exemplarAnswer:
      "Assigning let s2 = s1 on a String performs a move that transfers ownership of the heap buffer to s2 and invalidates s1 at compile time so both variables do not drop the same heap memory and cause a double-free bug. Stack-only types implement the Copy trait for trivial bitwise duplication, whereas heap types require calling .clone() for an explicit deep copy.",
    practiceDrills: {
      "Move Semantics & Source Invalidation": {
        topic: "Move Semantics & Source Invalidation",
        question:
          'What happens if you try to `println!("{s1}")` after executing `let s2 = s1;` on a `String`?',
        hint: "Which variable now owns the heap buffer, and what did the compiler do to `s1`?",
        targetKeywords: [
          "move",
          "invalid",
          "borrow of moved",
          "ownership",
          "compile",
        ],
      },
      "Double-Free Prevention": {
        topic: "Double-Free Prevention",
        question:
          "How would a shallow copy of a `String` without invalidating the source lead to memory corruption?",
        hint: "Trace what happens when the lexical scope ends for both variables.",
        targetKeywords: ["double-free", "double free", "drop", "twice", "heap"],
      },
      "Copy Trait vs. Explicit Clone": {
        topic: "Copy Trait vs. Explicit Clone",
        question:
          "Why can `i32` implement `Copy` while `String` only implements `Clone`?",
        hint: "Compare fixed-size stack scalars with heap pointers that require allocator calls.",
        targetKeywords: ["copy", "clone", "stack", "heap", "deep"],
      },
    },
  },
  {
    milestoneIdx: 2,
    title: "Milestone 3: References & The Borrowing Rules (&T vs. &mut T)",
    subtitle: "Compile-time data race elimination via Aliasing XOR Mutability",
    passage: `Instead of transferring ownership every time a function inspects data, Rust lets you create references—an act called Borrowing. A reference is a non-owning pointer guaranteed by the borrow checker to point to valid, aligned data for its entire duration. Because references do not own the underlying value, dropping a reference never deallocates the referent.

The borrow checker enforces the "Aliasing XOR Mutability" law at compile time: at any given point in execution, you may have EITHER any number of immutable shared references (\`&T\`) OR exactly one mutable exclusive reference (\`&mut T\`), never both simultaneously. This single rule eliminates data races at compile time, because a data race requires concurrent access where at least one alias mutates the memory without synchronization.`,
    questions: [
      'State Rust’s borrowing rules for shared (`&T`) and mutable (`&mut T`) references, and explain how "Aliasing XOR Mutability" prevents data races at compile time.',
      "Why can you have multiple `&T` references or a single `&mut T` reference, but never both at the same time?",
    ],
    rubricVersion: "rust-own-v1.0",
    rubric: [
      {
        id: "non-owning-borrow",
        topic: "Non-Owning References",
        description:
          "Explains that borrowing via references (&T / &mut T) accesses data without taking ownership or dropping it.",
        weight: 30,
        keywords: [
          "borrow",
          "reference",
          "non-owning",
          "ownership",
          "drop",
          "pointer",
        ],
      },
      {
        id: "aliasing-xor-mutability",
        topic: "Aliasing XOR Mutability (&T vs &mut T)",
        description:
          "States the rule: many immutable &T references OR one exclusive &mut T reference, never both at once.",
        weight: 40,
        keywords: [
          "immutable",
          "mutable",
          "exclusive",
          "shared",
          "one",
          "many",
          "multiple",
          "&mut",
          "xor",
        ],
      },
      {
        id: "data-race-prevention",
        topic: "Compile-Time Data Race Prevention",
        description:
          "Connects exclusive mutation to preventing concurrent read/write data races and iterator invalidation.",
        weight: 30,
        keywords: [
          "data race",
          "race",
          "concurrent",
          "mutate",
          "simultaneous",
          "compile",
        ],
      },
    ],
    exemplarAnswer:
      "Borrowing creates non-owning references that do not drop the value when they leave scope. Rust enforces Aliasing XOR Mutability: you can hold either multiple shared immutable references (&T) or a single exclusive mutable reference (&mut T), but never both simultaneously. This prevents data races and unexpected mutation at compile time.",
    practiceDrills: {
      "Non-Owning References": {
        topic: "Non-Owning References",
        question:
          "Why does passing `&String` to a helper function allow the caller to keep using the `String` afterward?",
        hint: "Does a reference take ownership or trigger `Drop` on the underlying heap buffer?",
        targetKeywords: ["borrow", "ownership", "drop", "reference"],
      },
      "Aliasing XOR Mutability (&T vs &mut T)": {
        topic: "Aliasing XOR Mutability (&T vs &mut T)",
        question:
          "Can a scope hold two active `&mut Vec<i32>` references to the same vector at the same time? Why or why not?",
        hint: "Recall the exclusivity requirement for mutable references.",
        targetKeywords: ["exclusive", "one", "mutable", "&mut", "alias"],
      },
      "Compile-Time Data Race Prevention": {
        topic: "Compile-Time Data Race Prevention",
        question:
          "What three conditions cause a data race, and which condition does the borrow checker make impossible?",
        hint: "Consider simultaneous aliasing and unsynchronized mutation.",
        targetKeywords: [
          "data race",
          "mutate",
          "simultaneous",
          "alias",
          "compile",
        ],
      },
    },
  },
  {
    milestoneIdx: 3,
    title: "Milestone 4: Slices (&str, &[T]) & Fat Pointers",
    subtitle: "Zero-copy contiguous views tied to collection borrow scopes",
    passage: `A Slice in Rust—such as a string slice \`&str\` or an array slice \`&[T]\`—is a dynamically sized view into a contiguous sequence of elements inside a collection without owning the collection. Under the hood, a slice reference is represented on the stack as a two-word "fat pointer" consisting of a pointer to the starting byte/element and an explicit element length.

Because a slice is an immutable borrow of the underlying container, the borrow checker ties the slice's validity to the container's mutation state. For example, if you compute a word slice \`let word: &str = &text[0..4];\` from a \`mut text: String\`, calling \`text.clear()\` while \`word\` is still used later in the function is rejected at compile time—preventing use-after-free and dangling slice pointers.`,
    questions: [
      "What is a slice (`&str` or `&[T]`) represented as on the stack, and why does holding an active `&str` slice into a `String` prevent calling `text.clear()`?",
      "Explain how a fat pointer works for Rust slices and how the borrow checker prevents a slice from becoming a dangling pointer when the parent collection mutates.",
    ],
    rubricVersion: "rust-own-v1.0",
    rubric: [
      {
        id: "contiguous-view",
        topic: "Non-Owning Contiguous View",
        description:
          "Defines a slice (&str / &[T]) as a non-owning view into a contiguous sequence of elements.",
        weight: 30,
        keywords: [
          "slice",
          "contiguous",
          "view",
          "&str",
          "non-owning",
          "sequence",
        ],
      },
      {
        id: "fat-pointer",
        topic: "Fat Pointer Representation (Ptr + Len)",
        description:
          "Identifies that a slice reference stores a fat pointer containing a start pointer and a length.",
        weight: 35,
        keywords: [
          "fat pointer",
          "pointer",
          "length",
          "two-word",
          "start",
          "len",
        ],
      },
      {
        id: "borrow-conflict-clear",
        topic: "Immutable Borrow Blocks Mutation (.clear())",
        description:
          "Explains that an active slice borrows the String immutably, so .clear() (which requires &mut) is rejected to prevent dangling pointers.",
        weight: 35,
        keywords: [
          "immutable",
          "mutable",
          "clear",
          "dangling",
          "use-after-free",
          "borrow",
        ],
      },
    ],
    exemplarAnswer:
      "A slice (&str or &[T]) is a non-owning view into a contiguous sequence of elements, stored on the stack as a two-word fat pointer (starting pointer and length). Because taking &text[0..4] creates an active immutable borrow of the String, calling text.clear()—which requires an exclusive mutable borrow—is rejected by the compiler, preventing dangling pointers and use-after-free.",
    practiceDrills: {
      "Non-Owning Contiguous View": {
        topic: "Non-Owning Contiguous View",
        question:
          "Why is accepting `&str` in a function signature more flexible than accepting `&String`?",
        hint: "Both heap `String`s and static string literals can be viewed as a contiguous UTF-8 slice.",
        targetKeywords: ["slice", "view", "&str", "contiguous"],
      },
      "Fat Pointer Representation (Ptr + Len)": {
        topic: "Fat Pointer Representation (Ptr + Len)",
        question:
          "What two pieces of data are stored inside a `&str` fat pointer on the stack?",
        hint: "Unlike a String, a slice cannot grow its allocation—so what metadata does it need?",
        targetKeywords: ["pointer", "length", "fat pointer"],
      },
      "Immutable Borrow Blocks Mutation (.clear())": {
        topic: "Immutable Borrow Blocks Mutation (.clear())",
        question:
          "Why does `text.clear()` require `&mut self`, and why does that conflict with a live `&str` slice of `text`?",
        hint: "Combine the fat pointer concept with the Aliasing XOR Mutability rule.",
        targetKeywords: ["immutable", "mutable", "clear", "borrow", "dangling"],
      },
    },
  },
  {
    milestoneIdx: 4,
    title: "Milestone 5: Lifetimes ('a) & Dangling Reference Prevention",
    subtitle: "Verifying that references never outlive their referents",
    passage: `Every reference in Rust has a Lifetime—the region of code for which that reference is statically guaranteed to remain valid. Most of the time, the compiler infers lifetimes automatically using Lifetime Elision rules, and Non-Lexical Lifetimes (NLL) end a borrow at its last actual use rather than the end of the lexical block.

When a function accepts multiple references and returns a reference—such as \`fn longest<'a>(x: &'a str, y: &'a str) -> &'a str\`—explicit lifetime annotations \`'a\` tell the borrow checker that the returned reference will live no longer than the shorter of the two input lifetimes \`x\` and \`y\`. Annotations never change how long a value lives at runtime; instead, they allow the compiler to reject any call site or local-variable return that would produce a dangling reference.`,
    questions: [
      "What does a lifetime annotation like `'a` in `fn longest<'a>(x: &'a str, y: &'a str) -> &'a str` express to the borrow checker, and why can a function never return a reference to a local stack variable?",
      "Explain how lifetime annotations and Non-Lexical Lifetimes (NLL) work together to prevent dangling references without runtime overhead.",
    ],
    rubricVersion: "rust-own-v1.0",
    rubric: [
      {
        id: "dangling-prevention",
        topic: "Dangling Reference Prevention",
        description:
          "Explains that references cannot outlive the data they point to (e.g., locals dropped at function return).",
        weight: 35,
        keywords: ["dangling", "outlive", "local", "dropped", "scope", "valid"],
      },
      {
        id: "lifetime-relationship",
        topic: "Generic Lifetime Constraint ('a)",
        description:
          "Notes that 'a relates input and output lifetimes (bounded by the shorter input) without altering runtime duration.",
        weight: 35,
        keywords: [
          "shorter",
          "input",
          "return",
          "relate",
          "annotation",
          "runtime",
          "constraint",
        ],
      },
      {
        id: "nll-elision",
        topic: "Non-Lexical Lifetimes (NLL) & Elision",
        description:
          "Mentions compiler inference/elision or NLL ending borrows at their last usage point.",
        weight: 30,
        keywords: [
          "nll",
          "non-lexical",
          "last use",
          "elision",
          "infer",
          "compile",
        ],
      },
    ],
    exemplarAnswer:
      "Lifetime annotations like 'a do not change how long values live at runtime; they declare a compile-time constraint that the returned reference cannot outlive the shorter of the input lifetimes x and y. A function cannot return a reference to a local variable because the local is dropped when the function exits, which would create a dangling reference. Non-Lexical Lifetimes (NLL) also end borrows at their last use.",
    practiceDrills: {
      "Dangling Reference Prevention": {
        topic: "Dangling Reference Prevention",
        question:
          'Why does returning `&s` where `let s = String::from("hello");` is created inside the function fail to compile?',
        hint: "What happens to `s` on the stack and heap the instant the function returns?",
        targetKeywords: ["dangling", "drop", "local", "outlive", "scope"],
      },
      "Generic Lifetime Constraint ('a)": {
        topic: "Generic Lifetime Constraint ('a)",
        question:
          "Does adding `'a` to a function signature make a variable live longer at runtime?",
        hint: "Distinguish compile-time verification constraints from runtime memory allocation.",
        targetKeywords: [
          "runtime",
          "compile",
          "shorter",
          "constraint",
          "outlive",
        ],
      },
      "Non-Lexical Lifetimes (NLL) & Elision": {
        topic: "Non-Lexical Lifetimes (NLL) & Elision",
        question:
          "How do Non-Lexical Lifetimes (NLL) make the borrow checker more ergonomic inside a single function?",
        hint: "Does a borrow last until the closing `}` brace, or until the last statement that reads the reference?",
        targetKeywords: ["last use", "nll", "non-lexical", "scope", "borrow"],
      },
    },
  },
];

export const MILESTONE_MATERIALS: MilestoneMaterial[] = RAW_PASSAGES.map(
  (item) => ({
    ...item,
    contentHash: hashAnswerText(`${item.title}::${item.passage}`),
  })
);

export function getMilestoneMaterial(milestoneIdx: number): MilestoneMaterial {
  const safeIdx =
    Math.abs(Math.floor(milestoneIdx)) % MILESTONE_MATERIALS.length;
  return MILESTONE_MATERIALS[safeIdx];
}
