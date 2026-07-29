import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchProjectEnvironments,
  createProjectEnvironment,
  updateProjectEnvironment,
  deleteProjectEnvironment,
  fetchProjectVaultItems,
  createProjectVaultItem,
  updateProjectVaultItem,
  deleteProjectVaultItem,
} from "../components/api";
import {
  FiPlus,
  FiSearch,
  FiX,
  FiEdit2,
  FiTrash2,
  FiCopy,
  FiEye,
  FiEyeOff,
  FiShield,
  FiKey,
  FiTerminal,
  FiFileText,
  FiLock,
  FiGlobe,
  FiServer,
  FiDatabase,
  FiInfo,
  FiRefreshCw,
  FiExternalLink,
  FiLayers,
  FiImage,
  FiUpload,
  FiUser,
} from "react-icons/fi";

// Color mapping for categories - using explicit color values instead of dynamic Tailwind
const CATEGORY_COLORS = {
  Credential: { bg: "#e0e7ff", text: "#4338ca", iconBg: "#c7d2fe" },
  Command: { bg: "#f1f5f9", text: "#475569", iconBg: "#e2e8f0" },
  Token: { bg: "#f3e8ff", text: "#7e22ce", iconBg: "#e9d5ff" },
  Note: { bg: "#dbeafe", text: "#1d4ed8", iconBg: "#bfdbfe" },
  Server: { bg: "#d1fae5", text: "#047857", iconBg: "#a7f3d0" },
  Database: { bg: "#ffe4e6", text: "#be123c", iconBg: "#fecdd3" },
  Update: { bg: "#cffafe", text: "#0e7490", iconBg: "#a5f3fc" },
  Info: { bg: "#e0e7ff", text: "#4338ca", iconBg: "#c7d2fe" },
  Media: { bg: "#fce7f3", text: "#be185d", iconBg: "#fbcfe8" },
};

const CATEGORIES = {
  Credential: { icon: FiKey },
  Command: { icon: FiTerminal },
  Token: { icon: FiShield },
  Note: { icon: FiFileText },
  Server: { icon: FiServer },
  Database: { icon: FiDatabase },
  Update: { icon: FiRefreshCw },
  Info: { icon: FiInfo },
  Media: { icon: FiImage },
};

const SECTIONS = [
  { id: "environments", label: "Environments", icon: FiGlobe },
  { id: "credentials", label: "Credentials", icon: FiKey },
  { id: "commands", label: "Commands", icon: FiTerminal },
  { id: "media", label: "Media", icon: FiImage },
  { id: "info", label: "Project Info", icon: FiInfo },
  { id: "updates", label: "Updates", icon: FiRefreshCw },
];

// Environment Card Component
const EnvironmentCard = ({ env, onEdit, onDelete }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="group bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-lg hover:border-slate-300 transition-all duration-200"
  >
    <div className="flex justify-between items-start mb-3">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl" style={{ backgroundColor: "#d1fae5", color: "#047857" }}>
          <FiGlobe className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900">{env.name}</h3>
          {env.url && (
            <a
              href={env.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-0.5"
            >
              <FiExternalLink className="h-3 w-3" />
              {env.url.replace(/^https?:\/\//, '').split('/')[0]}
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(env)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
          <FiEdit2 className="h-4 w-4" />
        </button>
        <button onClick={() => onDelete(env.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
          <FiTrash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
    {env.description && (
      <p className="text-sm text-slate-600">{env.description}</p>
    )}
  </motion.div>
);

// Vault Item Card Component
const VaultItemCard = ({ item, onEdit, onDelete, onCopy, showPassword, togglePassword, isMedia }) => {
  const category = CATEGORIES[item.category] || CATEGORIES.Note;
  const colors = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Note;
  const Icon = category.icon;
  const isCredential = item.category === "Credential";
  const isCode = item.category === "Command" || item.category === "Token";
  const envName = item.project_environment?.name;

  // Check if content is a media URL
  const isMediaContent = isMedia || item.category === "Media" || (item.content && /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|svg)$/i.test(item.content));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-lg hover:border-slate-300 transition-all duration-200"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 rounded-xl"
            style={{ backgroundColor: colors.iconBg, color: colors.text }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">{item.title}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                {item.category || "General"}
              </span>
              {envName && (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  {envName}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {!isMediaContent && (
            <button onClick={() => onEdit(item)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <FiEdit2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => onDelete(item.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
            <FiTrash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {isMediaContent ? (
          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {/\.(mp4|webm|mov)$/i.test(item.content) ? (
              <video src={item.content} controls className="w-full max-h-48 object-contain" />
            ) : (
              <img src={item.content} alt={item.title} className="w-full max-h-48 object-contain" loading="lazy" />
            )}
          </div>
        ) : isCredential ? (
          <div className="space-y-2">
            {item.username && (
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors">
                <div className="flex items-center gap-2 overflow-hidden">
                  <FiUser className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700 font-mono truncate">{item.username}</span>
                </div>
                <button onClick={() => onCopy(item.username, `user-${item.id}`)} className="text-slate-400 hover:text-indigo-600 p-1 shrink-0">
                  <FiCopy className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors">
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <FiLock className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-700 font-mono truncate">
                  {showPassword ? item.content : "••••••••••••"}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => togglePassword(item.id)} className="text-slate-400 hover:text-indigo-600 p-1">
                  {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                </button>
                <button onClick={() => onCopy(item.content, `pass-${item.id}`)} className="text-slate-400 hover:text-indigo-600 p-1">
                  <FiCopy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ) : isCode ? (
          <div className="relative group/code">
            <button
              onClick={() => onCopy(item.content, `code-${item.id}`)}
              className="absolute right-2 top-2 p-1.5 bg-slate-700 rounded-lg text-slate-300 hover:text-white opacity-0 group-hover/code:opacity-100 transition-opacity"
            >
              <FiCopy className="h-4 w-4" />
            </button>
            <pre className="p-3 bg-slate-900 rounded-xl text-emerald-400 font-mono text-sm overflow-x-auto">
              {item.content}
            </pre>
          </div>
        ) : (
          <div className="p-3 bg-slate-50 rounded-xl text-slate-700 text-sm border border-slate-200 leading-relaxed relative group/text">
            <button
              onClick={() => onCopy(item.content, `note-${item.id}`)}
              className="absolute right-2 top-2 p-1.5 bg-white rounded-lg text-slate-400 hover:text-indigo-600 opacity-0 group-hover/text:opacity-100 transition-all shadow-sm border border-slate-200"
            >
              <FiCopy className="h-4 w-4" />
            </button>
            <div className={`${!showPassword && item.content?.length > 150 ? "max-h-24 overflow-hidden" : ""}`}>
              {item.content}
            </div>
            {item.content?.length > 150 && (
              <button
                onClick={() => togglePassword(item.id)}
                className="mt-2 text-indigo-600 font-semibold hover:text-indigo-700 text-xs"
              >
                {showPassword ? "Show Less" : "Show More"}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Media Upload Zone Component
const MediaUploadZone = ({ onUploadComplete, projectId }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    await uploadFiles(files);
    e.target.value = ""; // Reset input
  };

  const uploadFiles = async (files) => {
    if (!files.length) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        // Create a FormData and upload to server
        const formData = new FormData();
        formData.append("file", file);
        formData.append("project_id", projectId);

        // For now, we'll create a media vault item with a temporary URL
        // In a real scenario, you'd upload to a file storage service
        const reader = new FileReader();

        await new Promise((resolve, reject) => {
          reader.onload = async () => {
            try {
              const isVideo = file.type.startsWith("video/");
              const isImage = file.type.startsWith("image/");

              if (!isVideo && !isImage) {
                toast.error(`${file.name} is not a valid image or video`);
                resolve();
                return;
              }

              // Create vault item with base64 data URL (for demo)
              // In production, you would upload to cloud storage and use the URL
              await createProjectVaultItem(projectId, {
                title: file.name,
                category: "Media",
                content: reader.result, // Base64 data URL
              });

              toast.success(`Uploaded ${file.name}`);
              resolve();
            } catch (err) {
              toast.error(`Failed to upload ${file.name}`);
              reject(err);
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      onUploadComplete();
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`
        col-span-full border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
        ${isDragging
          ? "border-indigo-400 bg-indigo-50"
          : "border-slate-300 hover:border-indigo-300 hover:bg-slate-50"
        }
        ${isUploading ? "opacity-50 pointer-events-none" : ""}
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-3">
        <div className={`p-3 rounded-xl ${isDragging ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
          <FiUpload className="h-8 w-8" />
        </div>
        {isUploading ? (
          <div className="flex items-center gap-2 text-indigo-600">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span className="font-medium">Uploading...</span>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-slate-700">
              {isDragging ? "Drop files here" : "Drag & drop files here"}
            </h3>
            <p className="text-sm text-slate-500">or click to browse (images and videos)</p>
          </>
        )}
      </div>
    </div>
  );
};

// Modal Component
const VaultModal = ({ isOpen, onClose, title, mode, formData, setFormData, onSave, environments, isEnvironment, isMedia }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                  {mode === "edit" ? <FiEdit2 className="h-5 w-5" /> : <FiPlus className="h-5 w-5" />}
                </div>
                <h2 className="text-xl font-bold text-slate-900">{title}</h2>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                <FiX className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={onSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name/Title</label>
                <input
                  type="text"
                  required
                  value={formData.name || formData.title || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, [isEnvironment ? "name" : "title"]: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder={isEnvironment ? "e.g., Production" : isMedia ? "e.g., Logo Image" : "e.g., AWS Credentials"}
                />
              </div>

              {isEnvironment ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">URL</label>
                    <input
                      type="url"
                      value={formData.url || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                      placeholder="https://app.example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={formData.description || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                      placeholder="Optional description..."
                    />
                  </div>
                </>
              ) : (
                <>
                  {!isMedia && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                      <select
                        value={formData.category || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all bg-white"
                      >
                        <option value="">Select Category...</option>
                        {Object.keys(CATEGORIES).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formData.category === "Credential" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Environment (Optional)</label>
                        <select
                          value={formData.project_environment_id || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, project_environment_id: e.target.value || null }))}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all bg-white"
                        >
                          <option value="">Global (All Environments)</option>
                          {environments.map(env => (
                            <option key={env.id} value={env.id}>{env.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                        <input
                          type="text"
                          value={formData.username || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                          placeholder="Enter username..."
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {isMedia ? "Media URL" : formData.category === "Credential" ? "Password/Secret" : "Content"}
                    </label>
                    {isMedia ? (
                      <input
                        type="url"
                        required
                        value={formData.content || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        placeholder="https://example.com/image.png or video.mp4"
                      />
                    ) : (
                      <textarea
                        required
                        rows={5}
                        value={formData.content || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-mono text-sm"
                        placeholder={formData.category === "Command" ? "Enter command..." : formData.category === "Credential" ? "Enter password or secret..." : "Enter content..."}
                      />
                    )}
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-200 transition-all"
                >
                  {mode === "edit" ? "Save Changes" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Main Component
const ProjectVault = ({ projectId }) => {
  const [activeSection, setActiveSection] = useState("environments");
  const [environments, setEnvironments] = useState([]);
  const [vaultItems, setVaultItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showPasswords, setShowPasswords] = useState({});
  const [selectedEnvFilter, setSelectedEnvFilter] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [isEnvironmentModal, setIsEnvironmentModal] = useState(false);
  const [isMediaModal, setIsMediaModal] = useState(false);
  const [formData, setFormData] = useState({});
  const [editingId, setEditingId] = useState(null);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const [envRes, itemsRes] = await Promise.all([
        fetchProjectEnvironments(projectId),
        fetchProjectVaultItems(projectId),
      ]);
      setEnvironments(Array.isArray(envRes.data) ? envRes.data : []);
      const itemsData = itemsRes.data?.items || (Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setVaultItems(itemsData);
    } catch (error) {
      console.error("Failed to load vault data:", error);
      toast.error("Failed to load vault data");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getCategoryForSection = (section) => {
    switch (section) {
      case "credentials": return ["Credential", "Token", "Server", "Database"];
      case "commands": return ["Command"];
      case "info": return ["Note", "Info"];
      case "updates": return ["Update"];
      case "media": return ["Media"];
      default: return [];
    }
  };

  // Fixed filter logic for credentials
  const filteredItems = vaultItems.filter(item => {
    const matchesSearch = item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content?.toLowerCase().includes(searchQuery.toLowerCase());
    const sectionCategories = getCategoryForSection(activeSection);
    const matchesSection = sectionCategories.includes(item.category);

    // Fix: Only apply environment filter in credentials section
    if (activeSection !== "credentials") {
      return matchesSearch && matchesSection;
    }

    // Fix: When selectedEnvFilter is empty, show ALL items (not filter by environment)
    if (!selectedEnvFilter) {
      return matchesSearch && matchesSection;
    }

    // Filter by global (no environment) or specific environment
    if (selectedEnvFilter === "global") {
      return matchesSearch && matchesSection && !item.project_environment_id;
    }

    return matchesSearch && matchesSection && String(item.project_environment_id) === selectedEnvFilter;
  });

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (isEnvironmentModal) {
        if (modalMode === "create") {
          await createProjectEnvironment(projectId, formData);
          toast.success("Environment created");
        } else {
          await updateProjectEnvironment(projectId, editingId, formData);
          toast.success("Environment updated");
        }
      } else {
        const dataToSave = isMediaModal ? { ...formData, category: "Media" } : formData;
        if (modalMode === "create") {
          await createProjectVaultItem(projectId, dataToSave);
          toast.success("Item created");
        } else {
          await updateProjectVaultItem(projectId, editingId, dataToSave);
          toast.success("Item updated");
        }
      }
      setIsModalOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error(`Failed to ${modalMode} ${isEnvironmentModal ? "environment" : "item"}`);
    }
  };

  const handleDelete = async (id, isEnv = false) => {
    if (!window.confirm(`Delete this ${isEnv ? "environment" : "item"}?`)) return;
    try {
      if (isEnv) {
        await deleteProjectEnvironment(projectId, id);
      } else {
        await deleteProjectVaultItem(projectId, id);
      }
      toast.success(`${isEnv ? "Environment" : "Item"} deleted`);
      loadData();
    } catch {
      toast.error(`Failed to delete`);
    }
  };

  const resetForm = () => {
    setFormData({});
    setEditingId(null);
    setIsEnvironmentModal(false);
    setIsMediaModal(false);
  };

  const openCreateModal = (isEnv = false, defaultCategory = "", isMedia = false) => {
    setModalMode("create");
    setIsEnvironmentModal(isEnv);
    setIsMediaModal(isMedia);
    setFormData(isEnv ? {} : { category: isMedia ? "Media" : defaultCategory });
    setIsModalOpen(true);
  };

  const openEditModal = (item, isEnv = false) => {
    setModalMode("edit");
    setIsEnvironmentModal(isEnv);
    setIsMediaModal(item.category === "Media");
    setEditingId(item.id);
    setFormData(isEnv ? { name: item.name, url: item.url, description: item.description } : {
      title: item.title,
      category: item.category,
      content: item.content,
      username: item.username,
      project_environment_id: item.project_environment_id,
    });
    setIsModalOpen(true);
  };

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied!", { id: key });
  };

  const togglePassword = (id) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getDefaultCategoryForSection = () => {
    switch (activeSection) {
      case "credentials": return "Credential";
      case "commands": return "Command";
      case "info": return "Note";
      case "updates": return "Update";
      case "media": return "Media";
      default: return "";
    }
  };

  const getSectionIcon = () => {
    const section = SECTIONS.find(s => s.id === activeSection);
    return section?.icon || FiLayers;
  };

  const SectionIcon = getSectionIcon();

  return (
    <div className="min-h-screen bg-slate-50 pb-10">

      {/* Compact Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
              <FiLayers className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900">Project Vault</h1>
              <p className="text-sm text-slate-500">Manage environments, credentials, commands, and documentation</p>
            </div>
          </div>

          <button
            onClick={() => openCreateModal(activeSection === "environments", getDefaultCategoryForSection(), activeSection === "media")}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 sm:w-auto"
          >
            <FiPlus className="h-4 w-4" />
            {activeSection === "environments" ? "New Environment" : activeSection === "media" ? "Add Media" : "New Item"}
          </button>
        </div>
      </div>

      {/* Navigation Tabs and Search */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 lg:w-auto">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              const count = section.id === "environments"
                ? environments.length
                : vaultItems.filter(i => getCategoryForSection(section.id).includes(i.category)).length;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${isActive
                    ? "bg-indigo-100 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                  {count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? "bg-indigo-200 text-indigo-700" : "bg-slate-200 text-slate-600"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
            {activeSection === "credentials" && environments.length > 0 && (
              <select
                value={selectedEnvFilter}
                onChange={(e) => setSelectedEnvFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-indigo-500 sm:w-auto"
              >
                <option value="">All Environments</option>
                <option value="global">Global Only</option>
                {environments.map(env => (
                  <option key={env.id} value={env.id}>{env.name}</option>
                ))}
              </select>
            )}
            <div className="relative w-full sm:w-72">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-40 bg-white rounded-xl animate-pulse border border-slate-200" />
              ))}
            </motion.div>
          ) : activeSection === "environments" ? (
            <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {environments.length > 0 ? environments.map(env => (
                <EnvironmentCard
                  key={env.id}
                  env={env}
                  onEdit={() => openEditModal(env, true)}
                  onDelete={(id) => handleDelete(id, true)}
                />
              )) : (
                <div className="col-span-full text-center py-16">
                  <FiGlobe className="h-16 w-16 mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-600 mb-1">No environments yet</h3>
                  <p className="text-slate-500 text-sm">Add environments like Production, Staging, Development</p>
                </div>
              )}
            </motion.div>
          ) : activeSection === "media" ? (
            <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Drag and Drop Upload Zone */}
              <MediaUploadZone
                projectId={projectId}
                onUploadComplete={loadData}
              />

              {/* Existing Media Items */}
              {filteredItems.map(item => (
                <VaultItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => openEditModal(item)}
                  onDelete={handleDelete}
                  onCopy={copyText}
                  showPassword={showPasswords[item.id]}
                  togglePassword={togglePassword}
                  isMedia={true}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.length > 0 ? filteredItems.map(item => (
                <VaultItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => openEditModal(item)}
                  onDelete={handleDelete}
                  onCopy={copyText}
                  showPassword={showPasswords[item.id]}
                  togglePassword={togglePassword}
                  isMedia={false}
                />
              )) : (
                <div className="col-span-full text-center py-16">
                  <SectionIcon className="h-16 w-16 mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-600 mb-1">No items in this section</h3>
                  <p className="text-slate-500 text-sm">Click "New Item" to add {activeSection}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <VaultModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalMode === "edit" ? (isEnvironmentModal ? "Edit Environment" : "Edit Item") : (isEnvironmentModal ? "New Environment" : isMediaModal ? "Add Media" : "New Item")}
        mode={modalMode}
        formData={formData}
        setFormData={setFormData}
        onSave={handleSave}
        environments={environments}
        isEnvironment={isEnvironmentModal}
        isMedia={isMediaModal}
      />
    </div>
  );
};

export default ProjectVault;
