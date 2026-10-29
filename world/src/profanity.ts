/* Wires the `obscenity` package (English dataset + leet/confusable transformers) into the bubble filter. */
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity'
import { setProfanity } from './filter.ts'
const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })
setProfanity(s => matcher.hasMatch(s))
