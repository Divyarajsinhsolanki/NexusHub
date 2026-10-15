import { expect, test } from '@jest/globals';
import { getComposerEntityQuery, getMentionedUserIds } from './mentions';

test('identifies completed mentions by user ID, including aliases and punctuation', () => {
  const user = { id: 2, name: 'Alice', email: 'alice.smith@example.com' };
  const lookups = { usersByHandle: { alice: user, 'alice.smith': user } };
  expect([...getMentionedUserIds('(@ALICE), @alice.smith @', lookups)]).toEqual(['2']);
  expect([...getMentionedUserIds('alice@example.com @alic @', lookups)]).toEqual([]);
  expect([...getMentionedUserIds('@alice', lookups, getComposerEntityQuery('@alice', 6))]).toEqual([]);
  expect([...getMentionedUserIds('@ @alice', lookups, getComposerEntityQuery('@ @alice', 1))]).toEqual(['2']);
});
