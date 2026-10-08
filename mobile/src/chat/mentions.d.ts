export type Entity = Record<string, any>;
export type ComposerEntity = { trigger: string; query: string; start: number; end: number };
export type MentionLookups = { usersByHandle?: Record<string, Entity>; tasksByKey?: Record<string, Entity> };
export function getUserMentionAliases(user?: Entity): string[];
export function getPreferredUserMentionHandle(user?: Entity): string;
export function getTaskReferenceKey(task?: Entity): string;
export function getComposerEntityQuery(text: string, selectionStart: number): ComposerEntity | null;
export function applyComposerEntity(text: string, entity: ComposerEntity, replacement: string): { value: string; selectionStart: number; selectionEnd: number };
export function tokenizeChatMessage(text: string, lookups?: MentionLookups): { kind: string; text: string; user?: Entity; task?: Entity }[];
