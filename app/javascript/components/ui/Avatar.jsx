import React, { useEffect, useState } from "react";

const Avatar = ({ name, src, className = "" }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const hasValidSrc = src && src !== "null" && src !== "";
  const displayName = (name || "").trim();
  const altText = displayName ? `${displayName}'s avatar` : "User avatar";

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  if (hasValidSrc && !imageFailed) {
    return (
      <img
        src={src}
        alt={altText}
        className={`rounded-full object-cover ${className}`.trim()}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }

  const initial = displayName ? displayName.charAt(0).toUpperCase() : "?";
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-theme font-bold text-white ${className}`.trim()}
      aria-label={altText}
    >
      {initial}
    </div>
  );
};

export default Avatar;
