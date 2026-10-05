let scriptPromise;

const loadRecaptcha = (siteKey) => {
  if (window.grecaptcha?.execute) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.dataset.portfolioRecaptcha = "true";
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error("Unable to load verification. Please retry or use the email link.")); };
      document.body.appendChild(script);
    }).catch((error) => { scriptPromise = undefined; throw error; });
  }
  return scriptPromise;
};

export async function getContactVerificationToken(siteKey) {
  if (!siteKey) throw new Error("Contact verification is unavailable. Please use the email link.");
  let timer;
  try {
    return await Promise.race([
      (async () => {
        await loadRecaptcha(siteKey);
        if (!window.grecaptcha?.ready || !window.grecaptcha?.execute) throw new Error("Verification is unavailable. Please use the email link.");
        await new Promise((resolve) => window.grecaptcha.ready(resolve));
        const token = await window.grecaptcha.execute(siteKey, { action: "contact_form_submit" });
        if (!token) throw new Error("Verification failed. Please use the email link.");
        return token;
      })(),
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("Verification could not complete. Please retry or use the email link.")), 12000);
      }),
    ]);
  } finally { window.clearTimeout(timer); }
}
