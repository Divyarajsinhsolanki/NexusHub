import React, { useState, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import { fetchItems, createItem, updateItem, deleteItem } from "../components/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiPlus,
  FiSearch,
  FiFilter,
  FiGrid,
  FiList,
  FiX,
  FiMoreVertical,
  FiEdit2,
  FiTrash2,
  FiCopy,
  FiCheckCircle,
  FiEye,
  FiEyeOff,
  FiShield,
  FiKey,
  FiTerminal,
  FiFileText,
  FiLock,
  FiUnlock,
  FiDownload,
  FiRefreshCw,
  FiFolder,
  FiTag,
  FiCpu,
  FiDatabase,
  FiServer,
  FiGlobe
} from "react-icons/fi";


const DEFAULT_SORT = "recent";

const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title_asc", label: "Title A-Z" },
  { value: "title_desc", label: "Title Z-A" }
];


// Premium Statistics Card
const StatCard = ({ icon: Icon, label, value, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay }}
    className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-4 shadow-lg"
  >
    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
    <div className="relative flex items-center gap-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color} shadow-lg`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-sm font-medium text-white/70">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  </motion.div>
);

// Premium Category Tab
const CategoryTab = ({ id, label, icon: Icon, isActive, onClick, index }) => (
  <motion.button
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, delay: index * 0.05 }}
    onClick={onClick}
    className={`relative flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-300 ${isActive
      ? "bg-white text-gray-900 shadow-xl shadow-white/20"
      : "bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900 backdrop-blur-sm"
      }`}

  >
    <Icon className="text-lg" />
    <span>{label}</span>
    {isActive && (
      <motion.div
        layoutId="activeVaultTab"
        className="absolute inset-0 rounded-xl bg-white -z-10"
        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
      />
    )}
  </motion.button>
);



const extractCategories = (items = []) => {
  const categories = new Set();
  items.forEach((item) => {
    if (item.category) {
      categories.add(item.category);
    }
  });
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
};

const extractTags = (items = []) => {
  const tags = new Set();
  items.forEach((item) => {
    const value = item?.tags;
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((tag) => {
        if (tag) tags.add(tag);
      });
    } else if (typeof value === "string") {
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .forEach((tag) => tags.add(tag));
    }
  });
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
};

// Premium Vault Card
const VaultCard = ({ item, onEdit, onDelete, onCopy, showPassword, togglePassword }) => {
  const isCredential = item.category === "Credential";
  const isCode = item.category === "Command" || item.category === "Token";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4 }}
      className="group relative bg-white/50 backdrop-blur-sm border border-white/60 rounded-2xl p-5 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-white/10 rounded-2xl -z-10" />
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500/0 via-indigo-500/50 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isCredential ? "bg-amber-100/50 text-amber-600" : isCode ? "bg-slate-800 text-emerald-400" : "bg-indigo-100/50 text-indigo-600"}`}>
            {isCredential ? <FiKey className="h-5 w-5" /> : isCode ? <FiTerminal className="h-5 w-5" /> : <FiFileText className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 leading-tight">{item.title}</h3>
            <span className="text-xs font-medium text-gray-500 bg-white/60 px-2 py-0.5 rounded-full border border-gray-100 mt-1 inline-block">
              {item.category || "General"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(item)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
            <FiEdit2 className="h-4 w-4" />
          </button>
          <button onClick={() => onDelete(item.id)} className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
            <FiTrash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {isCredential ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2.5 bg-white/60 rounded-xl border border-gray-100/50 group/field hover:border-indigo-200 transition-colors">
              <div className="flex items-center gap-2 overflow-hidden">
                <FiPlus className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700 font-mono truncate">{item.title}</span>
              </div>
              <button onClick={() => onCopy(item.title, `user-${item.id}`)} className="text-gray-400 hover:text-indigo-600 p-1">
                <FiCopy className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-white/60 rounded-xl border border-gray-100/50 group/field hover:border-indigo-200 transition-colors">
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <FiLock className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700 font-mono truncate">
                  {showPassword ? item.content : "••••••••••••"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => togglePassword(item.id)} className="text-gray-400 hover:text-indigo-600 p-1">
                  {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                </button>
                <button onClick={() => onCopy(item.content, `pass-${item.id}`)} className="text-gray-400 hover:text-indigo-600 p-1">
                  <FiCopy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ) : isCode ? (
          <div className="relative group/code">
            <div className="absolute right-2 top-2 opacity-0 group-hover/code:opacity-100 transition-opacity">
              <button
                onClick={() => onCopy(item.content, `code-${item.id}`)}
                className="p-1.5 bg-white/10 backdrop-blur-md rounded-lg text-white hover:bg-white/20 transition-colors border border-white/20"
              >
                <FiCopy className="h-4 w-4" />
              </button>
            </div>
            <pre className="p-3 bg-slate-900 rounded-xl text-emerald-400 font-mono text-sm overflow-x-auto border border-slate-800 shadow-inner">
              {item.content}
            </pre>
          </div>
        ) : (
          <div className="p-3 bg-indigo-50/50 rounded-xl text-gray-700 text-sm border border-indigo-100/50 leading-relaxed relative group/text">
            <button
              onClick={() => onCopy(item.content, `note-${item.id}`)}
              className="absolute right-2 top-2 p-1.5 bg-white/50 backdrop-blur-sm rounded-lg text-indigo-600 opacity-0 group-hover/text:opacity-100 transition-all hover:bg-white z-10"
            >
              <FiCopy className="h-4 w-4" />
            </button>
            <div className="relative">
              <div className={`${!showPassword && item.content?.length > 150 ? "max-h-24 overflow-hidden" : ""}`}>
                {item.content}
              </div>
              {item.content?.length > 150 && (
                <button
                  onClick={() => togglePassword(item.id)}
                  className="mt-2 text-indigo-600 font-bold hover:text-indigo-700 text-xs flex items-center gap-1"
                >
                  {showPassword ? "Show Less" : "Show More"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

    </motion.div>
  );
};


const VaultModal = ({ isOpen, onClose, title, category, content, onSave, onTitleChange, onCategoryChange, onContentChange, isEditing }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  {isEditing ? <FiEdit2 className="h-5 w-5" /> : <FiPlus className="h-5 w-5" />}
                </div>
                <h2 className="text-xl font-bold text-gray-900">{isEditing ? "Edit Item" : "Add New Item"}</h2>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <FiX className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={onSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder="e.g., GitHub API Key"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all appearance-none bg-white"
                >
                  <option value="">Select Category...</option>
                  <option value="Credential">Credential</option>
                  <option value="Command">Command</option>
                  <option value="Token">Token</option>
                  <option value="Note">Note</option>
                  <option value="Server">Server</option>
                  <option value="Database">Database</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  required
                  rows={5}
                  value={content}
                  onChange={(e) => onContentChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-mono text-sm"
                  placeholder="Paste your secret, command, or note here..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-xl shadow-lg shadow-indigo-200 transition-all"
                >
                  {isEditing ? "Save Changes" : "Create Item"}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const Vault = () => {
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // create | edit
  const [currentItem, setCurrentItem] = useState({ title: "", category: "", content: "" });
  const [editingId, setEditingId] = useState(null);
  const [showPasswords, setShowPasswords] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Stats
  const stats = {
    total: items.length,
    credentials: items.filter(i => i.category === "Credential").length,
    code: items.filter(i => ["Command", "Token"].includes(i.category)).length,
    notes: items.filter(i => !["Credential", "Command", "Token"].includes(i.category)).length
  };

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async (overrides = {}) => {
    setIsLoading(true);
    try {
      const { data } = await fetchItems({});
      const loadedItems = Array.isArray(data) ? data : (data.items || []);
      setItems(loadedItems);
    } catch {
      setItems([]);
      toast.error("Failed to load vault items");
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "All" ||
      (activeTab === "Credentials" && item.category === "Credential") ||
      (activeTab === "Code" && ["Command", "Token"].includes(item.category)) ||
      (activeTab === "Notes" && !["Credential", "Command", "Token"].includes(item.category));
    return matchesSearch && matchesTab;
  });

  const handleSave = async (e) => {
    e.preventDefault();
    if (!currentItem.title.trim() || !currentItem.content.trim()) {
      toast.error("Title and content are required");
      return;
    }

    try {
      if (modalMode === "create") {
        await createItem(currentItem);
        toast.success("Item created successfully");
      } else {
        await updateItem(editingId, currentItem);
        toast.success("Item updated successfully");
      }
      setIsModalOpen(false);
      resetForm();
      loadItems();
    } catch {
      toast.error(`Failed to ${modalMode} item`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    try {
      await deleteItem(id);
      toast.success("Item deleted");
      loadItems();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const resetForm = () => {
    setCurrentItem({ title: "", category: "", content: "" });
    setEditingId(null);
  };

  const openCreateModal = (category = "") => {
    setModalMode("create");
    setCurrentItem({ title: "", category, content: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setModalMode("edit");
    setEditingId(item.id);
    setCurrentItem({ title: item.title, category: item.category, content: item.content });
    setIsModalOpen(true);
  };

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard", { id: key });
  };

  const togglePassword = (id) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const tabs = [
    { id: "All", label: "All Items", icon: FiGrid },
    { id: "Credentials", label: "Credentials", icon: FiKey },
    { id: "Code", label: "Commands & Tokens", icon: FiTerminal },
    { id: "Notes", label: "Secure Notes", icon: FiLock },
  ];

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20">
      <Toaster position="top-right" />

      {/* Premium Hero Header */}
      <div className="relative overflow-hidden bg-slate-900 pb-12 sm:pb-16">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 opacity-90" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />

        <div className="relative mx-auto w-full max-w-7xl px-4 pb-6 pt-5 sm:px-6 lg:px-8">

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex flex-col items-stretch justify-between gap-5 sm:flex-row sm:items-start"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg">
                  <FiShield className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-[clamp(1.75rem,7vw,2.25rem)] font-bold tracking-tight text-white">Secure Vault</h1>
                  <p className="text-indigo-100 text-sm font-medium">{currentDate}</p>
                </div>
              </div>
              <p className="max-w-xl text-base text-indigo-100/80 sm:text-lg">
                Manage your credentials, API tokens, and sensitive notes in a secure, encrypted environment.
              </p>
            </div>

            <button
              onClick={() => openCreateModal()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-indigo-600 shadow-lg transition-all hover:-translate-y-1 hover:bg-gray-50 hover:shadow-xl sm:w-auto"
            >
              <FiPlus className="h-5 w-5" />
              New Item
            </button>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={FiList} label="Total Items" value={stats.total} color="bg-blue-500" delay={0.1} />
            <StatCard icon={FiKey} label="Credentials" value={stats.credentials} color="bg-amber-500" delay={0.2} />
            <StatCard icon={FiTerminal} label="Code Snippets" value={stats.code} color="bg-emerald-500" delay={0.3} />
            <StatCard icon={FiLock} label="Secure Notes" value={stats.notes} color="bg-purple-500" delay={0.4} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 mx-auto -mt-10 w-full max-w-7xl px-4 sm:-mt-12 sm:px-6 lg:px-8">

        <div className="mb-6 rounded-2xl border border-white/40 bg-white/80 p-2 shadow-xl backdrop-blur-xl sm:mb-8 sm:rounded-3xl sm:p-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            {/* Tabs */}
            <div className="flex overflow-x-auto pb-2 md:pb-0 w-full md:w-auto gap-2 scrollbar-none">
              {tabs.map((tab, idx) => (
                <CategoryTab
                  key={tab.id}
                  {...tab}
                  isActive={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  index={idx}
                />
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full md:w-80">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search vault..."
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6"
            >
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 bg-white/50 rounded-2xl animate-pulse border border-white/50" />
              ))}
            </motion.div>
          ) : (
            <motion.div
              layout
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6"
            >
              {filteredItems.map(item => (
                <VaultCard
                  key={item.id}
                  item={item}
                  onEdit={openEditModal}
                  onDelete={handleDelete}
                  onCopy={copyText}
                  showPassword={showPasswords[item.id]}
                  togglePassword={togglePassword}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {!isLoading && filteredItems.length === 0 && (
          <div className="py-16 text-center opacity-60 sm:py-24">
            <FiShield className="h-24 w-24 mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-medium text-gray-500">No items found</h3>
            <p className="text-gray-400">Try adjusting your search or add a new item.</p>
          </div>
        )}
      </div>

      <VaultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={currentItem.title}
        category={currentItem.category}
        content={currentItem.content}
        onTitleChange={(val) => setCurrentItem(prev => ({ ...prev, title: val }))}
        onCategoryChange={(val) => setCurrentItem(prev => ({ ...prev, category: val }))}
        onContentChange={(val) => setCurrentItem(prev => ({ ...prev, content: val }))}
        onSave={handleSave}
        isEditing={modalMode === "edit"}
      />
    </div>
  );
};

export default Vault;
