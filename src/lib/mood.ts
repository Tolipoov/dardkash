// Kayfiyat belgilari: suhbatdan oldin 1..5 (sessions.mood_before), keyin
// baholash oynasidagi qiymat (session_ratings.mood). FeedbackModal'dagi
// emoji'lar bilan bir xil.
export const MOOD_BEFORE_EMOJI: Record<number, string> = {
  1: "😞",
  2: "😕",
  3: "😐",
  4: "🙂",
  5: "😊",
};

export const MOOD_AFTER_EMOJI: Record<string, string> = {
  worse: "😔",
  same: "😐",
  better: "🙂",
  much_better: "😊",
};
