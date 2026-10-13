import { expect, jest, test } from "@jest/globals";
import { filterConversations, filterPosts } from "./feedFilters";
import type { Conversation, Post } from "../api/types";
const chats = [
  { id: 1, title: "Team", conversation_type: "group", unread_count: 2 },
  { id: 2, title: "Alex", conversation_type: "direct", unread_count: 0 },
  { id: 3, title: "Alex group", conversation_type: "group", unread_count: 0 },
] as Conversation[];
const posts = [
  {
    id: 1,
    message: "Release",
    user: { id: 1, first_name: "Alex", last_name: "One" },
    created_at: "2026-10-10",
    likes_count: 1,
    comments_count: 0,
  },
  {
    id: 2,
    message: "Photo",
    image_url: "/photo.png",
    user: { id: 2, first_name: "Sam", last_name: "Two" },
    created_at: "2026-10-11",
    likes_count: 2,
    comments_count: 3,
  },
] as Post[];
test("combines conversation search with unread and type filters", () => {
  expect(filterConversations(chats, "", "unread").map((row) => row.id)).toEqual(
    [1],
  );
  expect(
    filterConversations(chats, "alex", "direct").map((row) => row.id),
  ).toEqual([2]);
  expect(
    filterConversations(chats, "alex", "group").map((row) => row.id),
  ).toEqual([3]);
});
test("combines author/content search, post filters and stable engagement sorting", () => {
  expect(
    filterPosts(posts, "alex", "mine", "newest", 1).map((row) => row.id),
  ).toEqual([1]);
  expect(
    filterPosts(posts, "photo", "media", "newest", 1).map((row) => row.id),
  ).toEqual([2]);
  expect(
    filterPosts(posts, "", "discussed", "active", 1).map((row) => row.id),
  ).toEqual([2]);
  expect(
    filterPosts(posts, "", "all", "oldest", 1).map((row) => row.id),
  ).toEqual([1, 2]);
  expect(posts.map((row) => row.id)).toEqual([1, 2]);
});
