export interface Question { id: string; level: number; index: number; text: string }
/** Swap this for an AI-backed source later; it only needs to return the next card. */
export interface QuestionSource { next(level: number, used: Set<string>): Question | null }
const Q: string[][] = [
  ['What did you have for breakfast today?', 'Cats, dogs or neither?', 'What song is stuck in your head?', 'Beach or mountains?', 'Best snack of all time?', 'What are you watching at the moment?', 'Morning person or night owl?', "What's the last thing that made you laugh?"],
  ["What's a small thing that always makes your day?", 'Your perfect lazy Sunday?', 'A place you would love to visit next?', 'What were you obsessed with as a kid?', 'What do friends come to you for?', 'A skill you would love to learn?', 'What does a great weekend look like?', 'Favourite smell in the world?'],
  ['What are you most proud of this year?', 'What makes you feel at home?', 'Who shaped you the most growing up?', 'What do you value most in a friend?', 'A risk you are glad you took?', 'What does romance mean to you?', 'What are you working on in yourself?', 'When do you feel most like you?'],
  ['What is something you rarely tell people?', 'What scares you about getting close?', 'What would your ideal life look like in five years?', 'How do you show someone you care?', 'What did your last relationship teach you?', 'What do you need when you are having a bad day?', 'What is a dream you have not given up on?', 'What would make you trust someone fully?'],
  ['What made you want to keep talking to me?', 'What would a perfect first date with me be?', 'What do you hope I notice about you?', 'What should I know before we meet?', 'What surprised you most about me?', 'What are you hoping this becomes?', 'What would you like to ask me in person?', 'Where should we meet first?'],
]
export const localDeck: QuestionSource = {
  next(level, used) {
    const list = Q[level - 1]
    for (let i = 0; i < list.length; i++) { const id = `L${level}Q${i + 1}`; if (!used.has(id)) return { id, level, index: i + 1, text: list[i] } }
    return null
  },
}
export function cardById(id: string): Question | null {
  const m = /^L(\d)Q(\d+)$/.exec(id); if (!m) return null
  const level = +m[1], index = +m[2]; return { id, level, index, text: Q[level - 1][index - 1] }
}
