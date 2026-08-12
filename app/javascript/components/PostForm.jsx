import React, { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import { createPost } from "../components/api";
import { FiImage, FiSend, FiX } from 'react-icons/fi';
import Avatar from './ui/Avatar';

const PostForm = ({ refreshPosts, onPostCreated, user }) => {
  const [message, setMessage] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const userName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || 'You';

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const handleImageChange = (input) => {
    const file =
      (typeof File !== "undefined" && input instanceof File)
        ? input
        : input?.target?.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("Please upload a valid image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isDragActive) setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    if (e.currentTarget === e.target) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    handleImageChange(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = () => {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() && !image) {
      toast.error("Please write a message or upload an image");
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("post[message]", message);
    if (image) formData.append("post[image]", image);

    try {
      const { data: createdPost } = await createPost(formData);
      toast.success("Posted successfully!");
      setMessage("");
      removeImage();
      if (createdPost && typeof onPostCreated === 'function') {
        onPostCreated(createdPost);
      } else if (typeof refreshPosts === 'function') {
        refreshPosts();
      }
    } catch (error) {
      toast.error("Failed to create post. Please try again.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="nexus-post-composer" encType="multipart/form-data">
      <div className="flex items-start space-x-3">
        <Avatar name={userName} src={user?.profile_picture || user?.profile_picture_url} className="h-10 w-10 flex-shrink-0" />
        <div className="flex-1">
          <div
            data-testid="post-form-dropzone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`nexus-post-dropzone ${isDragActive ? "is-dragging" : ""}`}
          >
            <textarea
              placeholder="Share progress, a decision, question, or blocker…"
              aria-label="Write an update"
              className="nexus-post-composer-input"
              rows="3"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
            />

            {imagePreview && (
              <div className="nexus-post-image-preview">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="h-auto max-h-80 w-full object-contain"
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow-sm transition-colors hover:bg-white"
                  aria-label="Remove attached image"
                >
                  <FiX className="text-slate-700" />
                </button>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="nexus-post-attachment-button"
                  disabled={isSubmitting}
                >
                  <FiImage size={18} />
                  <span className="text-sm font-medium">Photo</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleImageChange}
                  accept="image/*"
                />
              </div>

              <button
                type="submit"
                className="nexus-post-submit"
                disabled={(!message.trim() && !image) || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Posting...
                  </>
                ) : (
                  <>
                    Post
                    <FiSend size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};

export default PostForm;
