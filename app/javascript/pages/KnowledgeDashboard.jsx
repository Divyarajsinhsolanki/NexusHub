import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Bell, BookOpen, Bookmark, Box, Clock, Cpu, Folder, GraduationCap, LayoutGrid, Newspaper, RefreshCw, Search, TrendingUp, X } from 'lucide-react';
import {
  FiBook,
  FiBookmark,
  FiClock,
  FiFolder,
  FiX,
  FiBell,
  FiCheckCircle,
  FiArchive,
  FiCpu,
  FiExternalLink,
  FiHash,
} from "react-icons/fi";
import TodayInHistoryCard from "../components/Knowledge/TodayInHistoryCard";
import QuoteOfTheDayCard from "../components/Knowledge/QuoteOfTheDayCard";
import TopNewsCard from "../components/Knowledge/TopNewsCard";
import LocalHeadlinesCard from "../components/Knowledge/LocalHeadlinesCard";
import DailyFactCard from "../components/Knowledge/DailyFactCard";
import WordOfTheDayCard from "../components/Knowledge/WordOfTheDayCard";
import RandomCodingTipCard from "../components/Knowledge/RandomCodingTipCard";
import ScienceNewsCard from "../components/Knowledge/ScienceNewsCard";
import TechNewsCard from "../components/Knowledge/TechNewsCard";
import PolicyBriefCard from "../components/Knowledge/PolicyBriefCard";
import DevToolOfTheDayCard from "../components/Knowledge/DevToolOfTheDayCard";
import OpenIssueSpotlightCard from "../components/Knowledge/OpenIssueSpotlightCard";
import TopGainersCard from "../components/Knowledge/TopGainersCard";
import TopVolumeStocksCard from "../components/Knowledge/TopVolumeStocksCard";
import TopBuyingStocksCard from "../components/Knowledge/TopBuyingStocksCard";
import IndianStockNewsCard from "../components/Knowledge/IndianStockNewsCard";
import CommonEnglishWordCard from "../components/Knowledge/CommonEnglishWordCard";
import EnglishTenseCard from "../components/Knowledge/EnglishTenseCard";
import EnglishPhraseCard from "../components/Knowledge/EnglishPhraseCard";
import ImageOfTheDayCard from "../components/Knowledge/ImageOfTheDayCard";
import DailyQuizCard from "../components/Knowledge/DailyQuizCard";
import StudyReminderCard from "../components/Knowledge/StudyReminderCard";
import './KnowledgeDashboard.css';
import { KnowledgeBookmarksProvider, useKnowledgeBookmarks } from "../context/KnowledgeBookmarksContext";
import { archiveKnowledgeItem, fetchKnowledgeItems, fetchKnowledgePromptRuns } from "../components/api";

const Knowledge3DRoom = lazy(() => import('../components/Knowledge3DRoom/Knowledge3DRoom'));

class KnowledgeRoomBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="knowledge-empty"><h2>The room is unavailable</h2><button onClick={this.props.onClose}>Return to library</button></div> : this.props.children; }
}

const generatedBookmarkPayload = (item) => ({
  cardType: "mcp_knowledge_item",
  sourceId: `knowledge_item:${item.id}`,
  collectionName: item.collection_name || "ChatGPT Inbox",
  reminderIntervalDays: 7,
  title: item.title,
  subtitle: item.summary || item.source_name || item.category,
  payload: {
    title: item.title,
    summary: item.summary,
    body: item.body,
    category: item.category,
    item_type: item.item_type,
    collection_name: item.collection_name,
    source_name: item.source_name,
    source_url: item.source_url,
    url: item.source_url,
    source_key: item.source_key,
    published_at: item.published_at,
    tags: item.tags || [],
    prompt: item.prompt,
    prompt_run_id: item.prompt_run_id,
    knowledge_item_id: item.id,
  },
});

// Category Tab Component
const CategoryTab = ({ category, isActive, onClick }) => {
  const Icon = category.Icon;
  return <button type="button" aria-pressed={isActive} onClick={onClick} className={`knowledge-nav-item ${isActive ? 'is-active' : ''}`}><Icon size={17} /><span>{category.name}</span>{category.count !== undefined && <small>{category.count}</small>}</button>;
};

function KnowledgeDashboardContent() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [view, setView] = useState('library');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [sort, setSort] = useState('default');
  const [uiLoading, setUiLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({ reminderDue: false, hasNotes: false });
  const [modalOpen, setModalOpen] = useState(false);
  const [bookmarkSaving, setBookmarkSaving] = useState(false);
  const [pendingBookmark, setPendingBookmark] = useState(null);
  const [collectionName, setCollectionName] = useState("");
  const [lastCollectionName, setLastCollectionName] = useState("");
  const [reminderIntervalDays, setReminderIntervalDays] = useState(7);
  const [feedback, setFeedback] = useState(null);
  const [knowledgeItems, setKnowledgeItems] = useState([]);
  const [promptRuns, setPromptRuns] = useState([]);
  const [generatedLoading, setGeneratedLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);

  const {
    bookmarks,
    dueBookmarks,
    collections,
    loading: bookmarksLoading,
    error: bookmarksError,
    refresh: refreshBookmarks,
    createBookmark,
    deleteBookmark,
    findBookmark,
    markReviewed,
  } = useKnowledgeBookmarks();

  useEffect(() => {
    const timer = setTimeout(() => setUiLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadGeneratedKnowledge = async () => {
      setGeneratedLoading(true);
      try {
        const [itemsResponse, runsResponse] = await Promise.all([
          fetchKnowledgeItems({ limit: 120 }),
          fetchKnowledgePromptRuns({ limit: 40 }),
        ]);

        if (cancelled) return;
        setKnowledgeItems(Array.isArray(itemsResponse.data) ? itemsResponse.data : []);
        setPromptRuns(Array.isArray(runsResponse.data) ? runsResponse.data : []);
      } catch (err) {
        console.error("Unable to load generated knowledge", err);
        if (!cancelled) {
          setFeedback({ type: "error", message: "Unable to load ChatGPT knowledge cards" });
        }
      } finally {
        if (!cancelled) setGeneratedLoading(false);
      }
    };

    loadGeneratedKnowledge();

    return () => {
      cancelled = true;
    };
  }, [loadVersion]);

  const savedCount = bookmarks.length;
  const dueCount = dueBookmarks.length;
  const activeGeneratedCount = knowledgeItems.filter((item) => item.active).length;
  const archivedGeneratedCount = knowledgeItems.filter((item) => !item.active).length;

  const categories = useMemo(
    () => [
      { id: "all", name: "Discover", Icon: LayoutGrid },
      { id: "news", name: "News", Icon: Newspaper },
      { id: "learning", name: "Learning", Icon: GraduationCap },
      { id: "stocks", name: "Markets", Icon: TrendingUp },
      { id: "tech", name: "Technology", Icon: Cpu },
      { id: "daily", name: "Daily tech", Icon: Cpu, count: knowledgeItems.filter((item) => item.active && item.generated_source === "bedrock_daily").length },
      { id: "mcp", name: 'ChatGPT inbox', Icon: BookOpen, count: knowledgeItems.filter((item) => item.active && item.generated_source !== "bedrock_daily").length },
      { id: "history", name: 'Prompt history', Icon: Clock, count: promptRuns.length },
      { id: "saved", name: 'Saved', Icon: Bookmark, count: savedCount },
      { id: "due", name: 'Review due', Icon: Bell, count: dueCount },
      { id: "archived", name: 'Archived', Icon: Archive, count: archivedGeneratedCount },
    ],
    [activeGeneratedCount, archivedGeneratedCount, dueCount, promptRuns.length, savedCount, knowledgeItems]
  );

  const cardDefinitions = useMemo(
    () => [
      {
        key: "today-history",
        cardType: "today_in_history",
        category: "learning",
        Component: TodayInHistoryCard,
        title: "Today in History",
        summary: "Historical events that happened on this day.",
      },
      {
        key: "quote-of-day",
        cardType: "quote_of_the_day",
        category: "learning",
        Component: QuoteOfTheDayCard,
        title: "Quote of the Day",
        summary: "A dose of inspiration to start your day.",
      },
      {
        key: "image-day",
        cardType: "image_of_the_day",
        category: "learning",
        Component: ImageOfTheDayCard,
        title: "Image of the Day",
        summary: "Discover a stunning astronomy image curated daily.",
      },
      {
        key: "daily-quiz",
        cardType: "daily_quiz",
        category: "learning",
        Component: DailyQuizCard,
        title: "Daily Quiz",
        summary: "Test yourself with a quick knowledge check.",
      },
      {
        key: "study-reminder",
        cardType: "study_reminder",
        category: "learning",
        Component: StudyReminderCard,
        title: "Study Reminders",
        summary: "Review what you've saved before reminders are due.",
      },
      {
        key: "top-news",
        cardType: "top_news",
        category: "news",
        Component: TopNewsCard,
        title: "Top News",
        summary: "Catch the top headlines from trusted sources.",
      },
      {
        key: "local-headlines",
        cardType: "local_headlines",
        category: "news",
        Component: LocalHeadlinesCard,
        title: "Local Headlines",
        summary: "Get the latest headlines tailored to your selected region.",
      },
      {
        key: "policy-briefs",
        cardType: "policy_briefs",
        category: "news",
        Component: PolicyBriefCard,
        title: "Policy Briefs",
        summary: "Review concise policy updates curated from trusted institutions.",
      },
      {
        key: "daily-fact",
        cardType: "daily_fact",
        category: "learning",
        Component: DailyFactCard,
        title: "Daily Fact",
        summary: "Learn an interesting fact every day.",
      },
      {
        key: "word-day",
        cardType: "word_of_the_day",
        category: "learning",
        Component: WordOfTheDayCard,
        title: "Word of the Day",
        summary: "Expand your vocabulary with a new word.",
      },
      {
        key: "common-word",
        cardType: "common_english_word",
        category: "learning",
        Component: CommonEnglishWordCard,
        title: "Common English Word",
        summary: "Master everyday words with practical usage tips.",
      },
      {
        key: "english-tense",
        cardType: "english_tense",
        category: "learning",
        Component: EnglishTenseCard,
        title: "English Tense",
        summary: "Review English tenses with quick refreshers.",
      },
      {
        key: "english-phrase",
        cardType: "english_phrase",
        category: "learning",
        Component: EnglishPhraseCard,
        title: "English Phrase",
        summary: "Understand helpful phrases and how to use them.",
      },
      {
        key: "coding-tip",
        cardType: "coding_tip",
        category: "tech",
        Component: RandomCodingTipCard,
        title: "Coding Tip",
        summary: "Sharpen your skills with a bite-sized coding tip.",
      },
      {
        key: "dev-tool-of-day",
        cardType: "dev_tool_of_the_day",
        category: "tech",
        Component: DevToolOfTheDayCard,
        title: "Dev Tool of the Day",
        summary: "Discover a developer tool to streamline your workflow.",
      },
      {
        key: "science-news",
        cardType: "science_news",
        category: "news",
        Component: ScienceNewsCard,
        title: "Science News",
        summary: "Stay curious with the latest science discoveries.",
      },
      {
        key: "tech-news",
        cardType: "tech_news",
        category: "tech",
        Component: TechNewsCard,
        title: "Tech News",
        summary: "Follow the newest stories in technology.",
      },
      {
        key: "open-issue-spotlight",
        cardType: "open_issue_spotlight",
        category: "tech",
        Component: OpenIssueSpotlightCard,
        title: "Open Issue Spotlight",
        summary: "Tackle a curated open source issue and give back.",
      },
      {
        key: "top-gainers",
        cardType: "top_gainers",
        category: "stocks",
        Component: TopGainersCard,
        title: "Top Gainers",
        summary: "See which stocks are climbing fastest today.",
      },
      {
        key: "top-volume",
        cardType: "top_volume",
        category: "stocks",
        Component: TopVolumeStocksCard,
        title: "Top Volume",
        summary: "Track the stocks with the highest trading volume.",
      },
      {
        key: "top-buying",
        cardType: "top_buying",
        category: "stocks",
        Component: TopBuyingStocksCard,
        title: "Top Buying",
        summary: "Monitor the most actively bought stocks.",
      },
      {
        key: "indian-news",
        cardType: "indian_stock_news",
        category: "stocks",
        Component: IndianStockNewsCard,
        title: "Indian Stock News",
        summary: "Follow the latest stories from Indian markets.",
      },
    ],
    []
  );

  const filterOptions = useMemo(
    () => [
      { key: "reminderDue", label: "Reminder due", icon: FiBell },
      { key: "hasNotes", label: "Has notes", icon: FiBook },
    ],
    []
  );

  const cardTypeMap = useMemo(() => {
    const map = new Map();
    cardDefinitions.forEach((definition) => {
      map.set(definition.cardType, definition);
    });
    return map;
  }, [cardDefinitions]);

  const handleBookmarkToggle = useCallback(async (bookmarkData) => {
    if (!bookmarkData) return;
    const existing = findBookmark(bookmarkData);
    try {
      if (existing) {
        await deleteBookmark(existing.id);
        setFeedback({ type: "info", message: "Removed from saved" });
      } else {
        setPendingBookmark(bookmarkData);
        setCollectionName(bookmarkData.collectionName || lastCollectionName || "");
        setReminderIntervalDays(bookmarkData.reminderIntervalDays || 7);
        setModalOpen(true);
      }
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    }
  }, [deleteBookmark, findBookmark, lastCollectionName]);

  const handleSaveGeneratedItem = useCallback(
    (item) => handleBookmarkToggle(generatedBookmarkPayload(item)),
    [handleBookmarkToggle]
  );

  const handleArchiveGeneratedItem = useCallback(async (item) => {
    if (!item?.id) return;
    try {
      const { data } = await archiveKnowledgeItem(item.id);
      setKnowledgeItems((current) => current.map((entry) => (entry.id === data.id ? data : entry)));
      setFeedback({ type: "success", message: "Archived generated knowledge card" });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err?.response?.data?.errors?.join(", ") || "Unable to archive knowledge card",
      });
    }
  }, []);

  const bookmarkHelpers = useMemo(
    () => ({
      toggle: handleBookmarkToggle,
      find: (bookmarkPayload) => findBookmark(bookmarkPayload),
      markReviewed: async (bookmark) => {
        try {
          await markReviewed(bookmark.id);
          setFeedback({ type: "success", message: "Marked as reviewed" });
        } catch (err) {
          setFeedback({ type: "error", message: err.message });
        }
      },
    }),
    [findBookmark, handleBookmarkToggle, markReviewed]
  );

  const filteredCards = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const hasSearch = normalizedSearch.length > 0;

    const matchesSearch = (metadata) => {
      if (!hasSearch) return true;
      const searchable = [
        metadata?.title,
        metadata?.summary,
        metadata?.body,
        metadata?.category,
        metadata?.sourceName,
        metadata?.sourceUrl,
        metadata?.prompt,
        ...(Array.isArray(metadata?.tags) ? metadata.tags : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedSearch);
    };

    const isReminderDue = (bookmark) => {
      if (!bookmark) return false;
      const nextReminder = bookmark.next_reminder_at ? new Date(bookmark.next_reminder_at) : null;
      if (!nextReminder) return false;
      return nextReminder <= new Date();
    };

    const bookmarkHasNotes = (bookmark) => {
      if (!bookmark) return false;
      const notes = bookmark.notes ?? bookmark.payload?.notes;
      if (Array.isArray(notes)) return notes.length > 0;
      if (typeof notes === "string") return notes.trim().length > 0;
      if (notes && typeof notes === "object") return Object.keys(notes).length > 0;
      return Boolean(notes);
    };

    const matchesFilterFlags = (bookmark) => {
      if (filters.reminderDue && !isReminderDue(bookmark)) {
        return false;
      }
      if (filters.hasNotes && !bookmarkHasNotes(bookmark)) {
        return false;
      }
      return true;
    };

    const savedCardFromBookmark = (bookmark, prefix) => {
      const definition = cardTypeMap.get(bookmark.card_type);
      return {
        key: `${prefix}-${bookmark.id}`,
        Component: definition?.Component ?? SavedBookmarkFallback,
        cardType: bookmark.card_type,
        roomSection: "review",
        props: {
          bookmarkHelpers,
          initialData: bookmark.payload,
          savedBookmark: bookmark,
          isSavedView: true,
          cardType: bookmark.card_type,
        },
        bookmark,
        metadata: {
          ...definition,
          title: bookmark.payload?.title || bookmark.payload?.question || definition?.title || "Saved item",
          summary: [bookmark.payload?.summary, bookmark.payload?.answer, bookmark.payload?.word, definition?.summary, ...(Array.isArray(bookmark.payload?.definitions) ? bookmark.payload.definitions : []).map((entry) => typeof entry === 'string' ? entry : entry?.text || entry?.definition)].filter(Boolean).join(' '),
          body: bookmark.payload?.body,
          tags: bookmark.payload?.tags || [],
        },
      };
    };

    const generatedCardFromItem = (item) => {
      const bookmarkData = generatedBookmarkPayload(item);
      const savedBookmark = findBookmark(bookmarkData);
      return {
        key: `generated-${item.id}`,
        Component: GeneratedKnowledgeCard,
        cardType: "mcp_knowledge_item",
        category: item.category || "mcp",
        roomSection: "inbox",
        generatedItem: item,
        bookmark: savedBookmark || null,
        props: {
          item,
          isSaved: Boolean(savedBookmark),
          onSave: handleSaveGeneratedItem,
          onArchive: handleArchiveGeneratedItem,
        },
        metadata: {
          title: item.title,
          summary: item.summary || item.body || "",
          body: item.body,
          category: item.category,
          tags: item.tags || [],
          sourceName: item.source_name,
          sourceUrl: item.source_url,
          prompt: item.prompt,
        },
      };
    };

    const promptRunCardFromRun = (run) => ({
      key: `prompt-run-${run.id}`,
      Component: PromptRunCard,
      cardType: "knowledge_prompt_run",
      category: "history",
      roomSection: "history",
      bookmark: null,
      promptRun: run,
      props: { run },
      metadata: {
        title: run.prompt,
        summary: `${run.item_count || 0} cards created via ${run.generation_mode || "history"}`,
        sourceName: run.source,
        prompt: run.prompt,
      },
    });

    if (activeCategory === "saved") {
      return bookmarks
        .map((bookmark) => savedCardFromBookmark(bookmark, "bookmark"))
        .filter((item) => matchesSearch(item.metadata) && matchesFilterFlags(item.bookmark));
    }

    if (activeCategory === "due") {
      return dueBookmarks
        .map((bookmark) => savedCardFromBookmark(bookmark, "due"))
        .filter((item) => matchesSearch(item.metadata) && matchesFilterFlags(item.bookmark));
    }

    if (activeCategory === "history") {
      return promptRuns
        .map(promptRunCardFromRun)
        .filter((item) => matchesSearch(item.metadata) && matchesFilterFlags(item.bookmark));
    }

    const generatedCards = knowledgeItems
      .filter((item) => (activeCategory === "archived" ? !item.active : item.active))
      .filter((item) => {
        if (activeCategory === "daily") return item.generated_source === "bedrock_daily";
        if (activeCategory === "mcp") return item.generated_source !== "bedrock_daily";
        if (activeCategory === "all" || activeCategory === "mcp" || activeCategory === "archived") return true;
        return item.category === activeCategory;
      })
      .map(generatedCardFromItem);

    const staticCards = activeCategory === "daily" || activeCategory === "mcp" || activeCategory === "archived"
      ? []
      : cardDefinitions
      .filter((definition) => activeCategory === "all" || definition.category === activeCategory)
      .map((definition) => ({
        key: definition.key,
        Component: definition.Component,
        cardType: definition.cardType,
        roomSection: "feed",
        props: {
          bookmarkHelpers,
          cardType: definition.cardType,
        },
        bookmark: null,
        metadata: definition,
      }));

    return [...generatedCards, ...staticCards]
      .filter((item) => matchesSearch(item.metadata) && matchesFilterFlags(item.bookmark));
  }, [
    activeCategory,
    bookmarks,
    bookmarkHelpers,
    cardDefinitions,
    cardTypeMap,
    dueBookmarks,
    findBookmark,
    filters.hasNotes,
    filters.reminderDue,
    handleArchiveGeneratedItem,
    handleSaveGeneratedItem,
    knowledgeItems,
    promptRuns,
    searchQuery,
  ]);

  const isLoading =
    uiLoading ||
    generatedLoading ||
    bookmarksLoading;
  const hasSearch = searchQuery.trim().length > 0;
  const filtersActive = Object.values(filters).some(Boolean);
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const visibleCards = useMemo(() => {
    const cards = filteredCards.filter((card) => !selectedCollection || card.bookmark?.collection_name === selectedCollection);
    return sort === 'title' ? [...cards].sort((a, b) => String(a.metadata?.title || '').localeCompare(String(b.metadata?.title || ''))) : cards;
  }, [filteredCards, selectedCollection, sort]);
  const selectCategory = (id) => { setActiveCategory(id); setSelectedCollection(''); };
  const clearFilters = () => { setSearchQuery(''); setFilters({ reminderDue: false, hasNotes: false }); setSelectedCollection(''); };
  const activeLabel = categories.find((category) => category.id === activeCategory)?.name || 'Discover';

  return (
    <>
      <section className={`knowledge-library ${view === 'room' ? 'knowledge-room-view' : ''}`}>
        <header className="knowledge-page-header"><div className="knowledge-heading"><h1>Knowledge</h1><span className="knowledge-date">{currentDate}</span></div><div className="knowledge-view-switch" role="group" aria-label="Knowledge view"><button type="button" aria-pressed={view === 'library'} onClick={() => setView('library')}><LayoutGrid size={16} /> Library</button><button type="button" aria-pressed={view === 'room'} onClick={() => setView('room')}><Box size={16} /> 3D room</button></div></header>
        {view === 'library' ? <div className="knowledge-workspace">
          <aside className="knowledge-sidebar" aria-label="Knowledge navigation">
            <span className="knowledge-nav-label">Explore</span><nav aria-label="Topics">{categories.slice(0, 5).map((category) => <CategoryTab key={category.id} category={category} isActive={activeCategory === category.id} onClick={() => selectCategory(category.id)} />)}</nav>
            <span className="knowledge-nav-label">Your library</span><nav aria-label="Library">{categories.slice(5).map((category) => <CategoryTab key={category.id} category={category} isActive={activeCategory === category.id} onClick={() => selectCategory(category.id)} />)}</nav>
            {collections.length > 0 && <div className="knowledge-collections"><span className="knowledge-nav-label">Collections</span>{collections.map((name) => <button type="button" key={name} className={`knowledge-nav-item ${selectedCollection === name ? 'is-active' : ''}`} onClick={() => { setActiveCategory('saved'); setSelectedCollection(name); }}><Folder size={16} /><span>{name}</span><small>{bookmarks.filter((bookmark) => bookmark.collection_name === name).length}</small></button>)}</div>}
          </aside>
          <div className="knowledge-main">
            <div className="knowledge-toolbar"><label className="knowledge-search"><Search size={18} /><input type="search" aria-label="Search knowledge" placeholder="Search topics, articles, saved notes..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />{searchQuery && <button type="button" aria-label="Clear search" title="Clear search" onClick={() => setSearchQuery('')}><X size={16} /></button>}</label><select aria-label="Sort knowledge" value={sort} onChange={(event) => setSort(event.target.value)}><option value="default">Recommended</option><option value="title">Title A-Z</option></select><button type="button" className="knowledge-refresh" title="Refresh knowledge" aria-label="Refresh knowledge" disabled={isLoading} onClick={() => { setFeedback(null); setLoadVersion((version) => version + 1); void refreshBookmarks?.(); }}><RefreshCw size={17} /></button></div>
            <div className="knowledge-results-header"><div><h2>{selectedCollection || activeLabel}</h2><span>{isLoading ? 'Loading...' : `${visibleCards.length} items`}</span></div><div className="knowledge-filters">{filterOptions.map((option) => <label key={option.key}><input type="checkbox" checked={filters[option.key]} onChange={(event) => setFilters((current) => ({ ...current, [option.key]: event.target.checked }))} />{option.label}</label>)}{(hasSearch || filtersActive || selectedCollection) && <button type="button" onClick={clearFilters}>Clear</button>}</div></div>
            {bookmarksError && <div role="alert" className="knowledge-notice">{bookmarksError}<button type="button" onClick={refreshBookmarks}>Retry</button></div>}
            {feedback && <div role={feedback.type === 'error' ? 'alert' : 'status'} className={`knowledge-notice ${feedback.type}`}><span>{feedback.message}</span><button type="button" aria-label="Dismiss notification" title="Dismiss" onClick={() => setFeedback(null)}><X size={16} /></button></div>}
            {isLoading ? <div className="knowledge-grid" aria-label="Loading knowledge" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div className="knowledge-skeleton" key={index}><span /><span /><span /></div>)}</div> : visibleCards.length ? <div className="knowledge-grid">{visibleCards.map((card) => { const Component = card.Component; return <div className="knowledge-entry" key={card.key}><Component {...card.props} />{card.bookmark && ['saved', 'due'].includes(activeCategory) && <SavedBookmarkFooter bookmark={card.bookmark} onRemove={() => handleBookmarkToggle({ cardType: card.bookmark.card_type, sourceId: card.bookmark.source_id, payload: card.bookmark.payload })} onMarkReviewed={() => bookmarkHelpers.markReviewed(card.bookmark)} />}</div>; })}</div> : <div className="knowledge-empty"><BookOpen size={32} /><h3>{hasSearch || filtersActive ? 'No matching items' : activeCategory === 'due' ? 'You are all caught up' : 'Nothing here yet'}</h3><p>{hasSearch || filtersActive ? 'Try a different search or clear the filters.' : 'Your knowledge will appear here when it is available.'}</p>{(hasSearch || filtersActive) && <button type="button" onClick={clearFilters}>Clear filters</button>}</div>}
          </div>
        </div> : <KnowledgeRoomBoundary onClose={() => setView('library')}><Suspense fallback={<div className="knowledge-empty" role="status">Opening the room...</div>}><Knowledge3DRoom
        initialViewMode="room"
        filteredCards={visibleCards}
        categories={categories}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filters={filters}
        setFilters={setFilters}
        isLoading={isLoading}
        savedCount={savedCount}
        dueCount={dueCount}
        filteredCardsLength={visibleCards.length}
        promptRuns={promptRuns}
        knowledgeItems={knowledgeItems}
        generatedLoading={generatedLoading}
        bookmarkHelpers={bookmarkHelpers}
        handleBookmarkToggle={handleBookmarkToggle}
        SavedBookmarkFallback={SavedBookmarkFallback}
        SavedBookmarkFooter={SavedBookmarkFooter}
        feedback={feedback}
        setFeedback={setFeedback}
      /></Suspense></KnowledgeRoomBoundary>}
      </section>

      {/* Premium Bookmark Modal */}
      <BookmarkModal
        open={modalOpen}
        saving={bookmarkSaving}
        bookmark={pendingBookmark}
        collectionName={collectionName}
        reminderIntervalDays={reminderIntervalDays}
        collections={collections}
        onCollectionChange={setCollectionName}
        onReminderChange={setReminderIntervalDays}
        onClose={() => {
          setModalOpen(false);
          setPendingBookmark(null);
        }}
        onSubmit={async () => {
          if (!pendingBookmark || bookmarkSaving) return;
          setBookmarkSaving(true);
          try {
            const created = await createBookmark({
              cardType: pendingBookmark.cardType,
              sourceId: pendingBookmark.sourceId,
              payload: pendingBookmark.payload,
              collectionName: collectionName || null,
              reminderIntervalDays,
            });
            setModalOpen(false);
            setPendingBookmark(null);
            setLastCollectionName(collectionName || "");
            setFeedback({ type: "success", message: "Saved to your knowledge collections" });
            return created;
          } catch (err) {
            setFeedback({ type: "error", message: err.message });
          } finally {
            setBookmarkSaving(false);
          }
        }}
      />
    </>
  );
}

const formatKnowledgeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function GeneratedKnowledgeCard({ item, isSaved, onSave, onArchive }) {
  const publishedAt = formatKnowledgeDate(item.published_at || item.created_at);
  const tags = Array.isArray(item.tags) ? item.tags.slice(0, 4) : [];

  return (
    <article className="flex h-full flex-col gap-3 rounded-[14px] border border-cyan-100 bg-white/92 p-4 text-slate-800 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-700">
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1">
              <FiCpu className="h-3 w-3" />
              {item.collection_name || "ChatGPT Inbox"}
            </span>
            {item.workspace_shared ? <span>Workspace · AI-generated</span> : item.category ? <span>{item.category}</span> : null}
          </div>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-slate-950">{item.title}</h3>
        </div>
        {!item.active ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">Archived</span>
        ) : null}
      </div>

      {item.summary ? <p className="line-clamp-3 text-sm leading-6 text-slate-600">{item.summary}</p> : null}
      {!item.summary && item.body ? <p className="line-clamp-4 text-sm leading-6 text-slate-600">{item.body}</p> : null}
      {item.body && <details className="knowledge-read"><summary><BookOpen size={14} /> Read full note</summary><p className="whitespace-pre-wrap text-sm">{item.body}</p></details>}

      <div className="mt-auto space-y-3">
        {tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                <FiHash className="h-3 w-3" />
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>{item.source_name || item.generated_source || "MCP"}</span>
          {publishedAt ? <span>{publishedAt}</span> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {item.source_url ? (
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FiExternalLink className="h-3.5 w-3.5" />
              Source
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => onSave(item)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              isSaved
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "bg-slate-950 text-white hover:bg-slate-800"
            }`}
          >
            <FiBookmark className="h-3.5 w-3.5" />
            {isSaved ? "Saved" : "Save"}
          </button>
          {item.active && item.can_archive !== false ? (
            <button
              type="button"
              onClick={() => onArchive(item)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-600"
            >
              <FiArchive className="h-3.5 w-3.5" />
              Archive
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function PromptRunCard({ run }) {
  const createdAt = formatKnowledgeDate(run.created_at);

  return (
    <article className="flex h-full flex-col gap-3 rounded-[14px] border border-indigo-100 bg-white/92 p-4 text-slate-800 shadow-sm">
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-indigo-700">
        <span className="rounded-full bg-indigo-50 px-2.5 py-1">{run.source || "mcp"}</span>
        <span>{run.generation_mode || "history"}</span>
      </div>
      <h3 className="line-clamp-4 text-base font-semibold leading-snug text-slate-950">{run.prompt}</h3>
      <div className="mt-auto grid grid-cols-2 gap-2 text-xs">
        <div className="border-t border-slate-100 pt-3">
          <span className="block text-slate-500">Cards</span>
          <strong className="text-lg text-slate-950">{run.item_count || 0}</strong>
        </div>
        <div className="border-t border-slate-100 pt-3">
          <span className="block text-slate-500">Status</span>
          <strong className="text-sm capitalize text-slate-950">{run.status || "completed"}</strong>
        </div>
      </div>
      {createdAt ? <p className="text-xs text-slate-500">Created {createdAt}</p> : null}
    </article>
  );
}

function SavedBookmarkFooter({ bookmark, onRemove, onMarkReviewed }) {
  const nextReminder = bookmark.next_reminder_at ? new Date(bookmark.next_reminder_at) : null;
  const lastViewed = bookmark.last_viewed_at ? new Date(bookmark.last_viewed_at) : null;
  const isDue = nextReminder ? nextReminder <= new Date() : false;

  return (
    <div className="knowledge-saved-footer">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="space-y-1.5 text-sm">
          {bookmark.collection_name && (
            <div className="flex items-center gap-2">
              <FiFolder className="h-4 w-4 text-indigo-500" />
              <span className="font-medium text-gray-700">{bookmark.collection_name}</span>
            </div>
          )}
          {lastViewed && (
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <FiClock className="h-3.5 w-3.5" />
              <span>Reviewed: {lastViewed.toLocaleDateString()}</span>
            </div>
          )}
          {nextReminder && (
            <div className={`flex items-center gap-2 text-xs ${isDue ? "text-rose-600 font-semibold" : "text-gray-500"}`}>
              <FiBell className={`h-3.5 w-3.5 ${isDue ? "text-rose-500" : ""}`} />
              <span>Next: {nextReminder.toLocaleDateString()}</span>
              {isDue && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-full text-[10px] font-bold uppercase">Due</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMarkReviewed}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            <FiCheckCircle className="h-3.5 w-3.5" />
            Mark reviewed
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-rose-100 hover:text-rose-600 transition-all duration-200"
          >
            <FiX className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}



function BookmarkModal({
  open,
  saving,
  bookmark,
  collectionName,
  reminderIntervalDays,
  collections,
  onCollectionChange,
  onReminderChange,
  onClose,
  onSubmit,
}) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('input')?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab') return;
      const fields = [...dialog.current.querySelectorAll('button:not(:disabled), input, select')];
      const first = fields[0]; const last = fields.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [open]);
  if (!open) return null;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <form ref={dialog} className="knowledge-modal" role="dialog" aria-modal="true" aria-labelledby="bookmark-dialog-title" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void onSubmit(); }}>
      <header><h2 id="bookmark-dialog-title">Save to collection</h2><button type="button" aria-label="Close bookmark dialog" title="Close" onClick={onClose}><X size={20} /></button></header>
      <div className="knowledge-modal-preview"><strong>{bookmark?.title}</strong><p>{bookmark?.subtitle}</p></div>
      <label htmlFor="bookmark-collection">Collection</label><input id="bookmark-collection" list="bookmark-collections" placeholder="Choose or create a collection" value={collectionName || ''} onChange={(event) => onCollectionChange(event.target.value)} /><datalist id="bookmark-collections">{collections.map((name) => <option key={name} value={name} />)}</datalist>
      <label htmlFor="bookmark-reminder">Review every (days)</label><input id="bookmark-reminder" type="number" min="1" max="365" required value={reminderIntervalDays} onChange={(event) => onReminderChange(Number(event.target.value))} />
      <div className="knowledge-modal-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save bookmark'}</button></div>
    </form>
  </div>;
}

function SavedBookmarkFallback({ savedBookmark }) {
  const payload = savedBookmark?.payload || {};
  return (
    <div className="p-5 space-y-3">
      <span className="text-xs text-gray-500">{savedBookmark?.collection_name || 'Saved item'}</span>
      <h3 className="font-semibold">{payload.title || payload.question || 'Saved knowledge'}</h3>
      <p className="text-sm text-gray-500">{payload.summary || payload.answer}</p>
      {payload.body && <p className="whitespace-pre-wrap text-sm">{payload.body}</p>}
      {(payload.source_url || payload.url) && <a href={payload.source_url || payload.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm">Read source <FiExternalLink /></a>}
    </div>
  );
}


export default function KnowledgeDashboard() {
  return (
    <KnowledgeBookmarksProvider>
      <KnowledgeDashboardContent />
    </KnowledgeBookmarksProvider>
  );
}
